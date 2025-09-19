import { add } from "@relish/core"
import { db } from "@relish/database"

console.log("Hello, World!")
console.log(add(1, 2))
console.log(await db.query.ExampleTable.findMany())
