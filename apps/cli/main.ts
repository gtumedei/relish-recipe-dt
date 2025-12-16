import { Command } from "@cliffy/command"
import { envCommand } from "~/commands/env.ts"
import { recipeProcessingCommand } from "~/commands/recipe-processing.ts"
import { sourceAdaptersCommand } from "~/commands/source-adapters.ts"
import { utilsCommand } from "~/commands/utils.ts"

const mainCommand = new Command()
  .name("relish")
  .action(() => {
    console.log(mainCommand.getHelp())
  })
  .command(envCommand.getName(), envCommand)
  .command(recipeProcessingCommand.getName(), recipeProcessingCommand)
  .command(sourceAdaptersCommand.getName(), sourceAdaptersCommand)
  .command(utilsCommand.getName(), utilsCommand)

await mainCommand.parse(Deno.args)
