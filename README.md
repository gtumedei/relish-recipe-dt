<div align="center">

![](https://f003.backblazeb2.com/file/dN2jPN/relish-cover.jpg)

# Relish Recipe Digital Twin

</div>

## Architecture diagram

TODO

## Project structure

- **`apps`**\
  Contains applications that can be deployed.
  - `api`\
    A web API to control the Relish system.
  - `cli`\
    A CLI to control the Relish system.
- **`packages`**
  Contains shared reusable libraries.
  - `env`\
    Handles loading and validating environment variables.
  - `ingestor`\
    Logic to ingest data from external sources into the Relish database.
  - `modeling`\
    Simulate the evolution of recipes based on certain factors.
  - `recipe-processing`\
    Logic to parse the unstructured or semi-structured description of a recipe into a well-defined structure.
  - `source-adapters`\
    Logic to fetch recipe data from external sources.
    - `bluesky`
    - `youtube`
  - `storage`\
    Logic to store data in the db or in the file system.
  - `utils`\
    Shared utilities for things such as logging, running shell commands, etc.

## Running locally

### Requirements

- To run the whole system using Docker, you only need [Docker](https://www.docker.com/) (obv).
- Alternatively, you can run the database using Docker and the rest of the system locally, which is handy for development. In this case, you're going to need:
  - [Docker](https://www.docker.com/)
  - [Deno](https://deno.com/)
  - [yt-dlp](https://github.com/yt-dlp/yt-dlp) in `PATH` to download videos from YouTube
  - [ffmpeg](https://ffmpeg.org/) and [ffprobe](https://ffmpeg.org/ffprobe.html) in `PATH` to get metadata and extract frames from videos

### Procedure

**Fully on Docker**

TODO

**Only the database on Docker**

TODO
