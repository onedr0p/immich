# Immich monolith

This image is experimental and not meant to be used!  
Also, you should really use the separate images anyways. Only use this if you really, genuinely have to.  
Finally, know that this is just an experiment. This is not a guarantee that we will actually make a monolith image for production usage.

To build, run `docker build . -t immich-monolith:latest`  
To run, `docker run -it --rm --env JWT_SECRET=asdf1234 immich-monolith:latest `

## Status
Currently this image contains postgres, redis, and immich-server. The rest is still to be added.  
For startup, we should use supervisord for process management.  
We probably need to use HOSTALIASES to get the server addresses right.  