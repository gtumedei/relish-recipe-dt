import { db } from "./database.ts"

const EMBEDDING_DIMENSIONS = 1536 // The size must match the one required by the embedding model you are going to use

const createVectorIndex = async (collection: string, field: string) => {
  return await db.$runCommandRaw({
    createSearchIndexes: collection,
    indexes: [
      {
        name: `${collection}_${field}_vector_index`,
        type: "vectorSearch",
        definition: {
          fields: [
            {
              type: "vector",
              path: field,
              numDimensions: EMBEDDING_DIMENSIONS,
              similarity: "cosine",
            },
          ],
        },
      },
    ],
  })
}

await createVectorIndex("Dish", "nameEmbedding")
await createVectorIndex("Ingredient", "nameEmbedding")
await createVectorIndex("Tool", "nameEmbedding")

console.log("✔ Created vector search indexes")
