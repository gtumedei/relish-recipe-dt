import { db } from "@relish/database"

console.log("Hello, World!")
console.log(await db.query.ExampleTable.findMany())
