import {
  IAssetJob,
  IAssetRepository,
  IBaseJob,
  IJobRepository,
  IStorageRepository,
  JobName,
  QueueName,
  StorageCore,
  StorageFolder,
  SystemConfigFFmpegDto,
  SystemConfigService,
  WithoutProperty,
} from '@app/domain';
import { AssetEntity, AssetType, TranscodePreset } from '@app/infra/entities';
import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import { join } from 'path';

@Processor(QueueName.VIDEO_CONVERSION)
export class VideoTranscodeProcessor {
  readonly logger = new Logger(VideoTranscodeProcessor.name);
  private storageCore = new StorageCore();

  constructor(
    @Inject(IAssetRepository) private assetRepository: IAssetRepository,
    @Inject(IJobRepository) private jobRepository: IJobRepository,
    private systemConfigService: SystemConfigService,
    @Inject(IStorageRepository) private storageRepository: IStorageRepository,
  ) {}

  @Process({ name: JobName.QUEUE_VIDEO_CONVERSION, concurrency: 1 })
  async handleQueueVideoConversion(job: Job<IBaseJob>): Promise<void> {
    try {
      const { force } = job.data;
      const assets = force
        ? await this.assetRepository.getAll({ type: AssetType.VIDEO })
        : await this.assetRepository.getWithout(WithoutProperty.ENCODED_VIDEO);
      for (const asset of assets) {
        await this.jobRepository.queue({ name: JobName.VIDEO_CONVERSION, data: { asset } });
      }
    } catch (error: any) {
      this.logger.error('Failed to queue video conversions', error.stack);
    }
  }

  @Process({ name: JobName.VIDEO_CONVERSION, concurrency: 2 })
  async handleVideoConversion(job: Job<IAssetJob>) {
    const { asset } = job.data;

    const encodedVideoPath = this.storageCore.getFolderLocation(StorageFolder.ENCODED_VIDEO, asset.ownerId);

    this.storageRepository.mkdirSync(encodedVideoPath);

    const savedEncodedPath = join(encodedVideoPath, `${asset.id}.mp4`);

    await this.runVideoEncode(asset, savedEncodedPath);
  }

  async runFFProbePipeline(asset: AssetEntity): Promise<FfprobeData> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(asset.originalPath, (err, data) => {
        if (err || !data) {
          this.logger.error(`Cannot probe video ${err}`, 'runFFProbePipeline');
          reject(err);
        }

        resolve(data);
      });
    });
  }

  async runVideoEncode(asset: AssetEntity, savedEncodedPath: string): Promise<void> {
    const config = await this.systemConfigService.getConfig();

    const transcode = await this.needsTranscoding(asset, config.ffmpeg);
    if (transcode) {
      //TODO: If video or audio are already the correct format, don't re-encode, copy the stream
      return this.runFFMPEGPipeLine(asset, savedEncodedPath);
    }
  }

  async needsTranscoding(asset: AssetEntity, ffmpegConfig: SystemConfigFFmpegDto): Promise<boolean> {
    switch (ffmpegConfig.transcode) {
      case TranscodePreset.ALL:
        return true;

      case TranscodePreset.REQUIRED:
        {
          const videoStream = await this.getVideoStream(asset);
          if (videoStream.codec_name !== ffmpegConfig.targetVideoCodec) {
            return true;
          }
        }
        break;

      case TranscodePreset.OPTIMAL: {
        const videoStream = await this.getVideoStream(asset);
        if (videoStream.codec_name !== ffmpegConfig.targetVideoCodec) {
          return true;
        }

        const videoHeightThreshold = 1080;
        return !videoStream.height || videoStream.height > videoHeightThreshold;
      }
    }
    return false;
  }

  async getVideoStream(asset: AssetEntity): Promise<ffmpeg.FfprobeStream> {
    const videoInfo = await this.runFFProbePipeline(asset);

    const videoStreams = videoInfo.streams.filter((stream) => {
      return stream.codec_type === 'video';
    });

    const longestVideoStream = videoStreams.sort((stream1, stream2) => {
      const stream1Frames = Number.parseInt(stream1.nb_frames ?? '0');
      const stream2Frames = Number.parseInt(stream2.nb_frames ?? '0');
      return stream2Frames - stream1Frames;
    })[0];

    return longestVideoStream;
  }

  async runFFMPEGPipeLine(asset: AssetEntity, savedEncodedPath: string): Promise<void> {
    const config = await this.systemConfigService.getConfig();

    return new Promise((resolve, reject) => {
      ffmpeg(asset.originalPath)
        .outputOptions([
          `-crf ${config.ffmpeg.crf}`,
          `-preset ${config.ffmpeg.preset}`,
          `-vcodec ${config.ffmpeg.targetVideoCodec}`,
          `-acodec ${config.ffmpeg.targetAudioCodec}`,
          `-vf scale=${config.ffmpeg.targetScaling}`,

          // Makes a second pass moving the moov atom to the beginning of
          // the file for improved playback speed.
          `-movflags faststart`,
        ])
        .output(savedEncodedPath)
        .on('start', () => {
          this.logger.log('Start Converting Video');
        })
        .on('error', (error) => {
          this.logger.error(`Cannot Convert Video ${error}`);
          reject();
        })
        .on('end', async () => {
          this.logger.log(`Converting Success ${asset.id}`);
          await this.assetRepository.save({ id: asset.id, encodedVideoPath: savedEncodedPath });
          resolve();
        })
        .run();
    });
  }
}
