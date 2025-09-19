<div align="center">

# Relish Recipe Digital Twin

</div>

> [!WARNING]
> The project is at a very initial stage and everything is subject to sudden changes.

## Project structure

- `core`\
  Core data models.
- `database`\
  Logic to store data in a db.
- `env`\
  Handles loading and validating environment variables.
- `ingestor`\
  Logic to ingest data from external sources.
- `modeling`\
  Simulate the evolution of recipes based on certain factors.
- `recipe-parser`\
  Logic to transform unstructured or semi-structured content into a well-defined recipe schema.
- `source-adapters`\
  Logic to fetch recipe data from external sources.
  - `bluesky`
  - `youtube`

### Conventions

- A workspace containing `main.ts` is an app and can be run.
- A workspace containing `mod.ts` is a package and its content can be imported from other packages.
