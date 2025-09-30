import { db } from "@relish/database"

console.log("Hello, World!")

const res = await db.dinosaur.findMany()
console.log(res)
