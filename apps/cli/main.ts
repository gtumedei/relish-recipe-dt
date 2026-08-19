import { Command } from "@cliffy/command"
import { withDependencies, withSelectedDependencies } from "@relish/di"
import { createAdapters } from "@relish/source-adapters"
import { createLogger } from "@relish/utils/logger"
import { apiKeysCommand } from "~/commands/api-keys.ts"
import { envCommand } from "~/commands/env.ts"
import { recipeProcessingCommand } from "~/commands/recipe-processing.ts"
import { sourceAdaptersCommand } from "~/commands/source-adapters/source-adapters.ts"
import { utilsCommand } from "~/commands/utils.ts"

const mainCommand = new Command()
  .name("relish")
  .action(() => {
    console.log(mainCommand.getHelp())
  })
  .command(apiKeysCommand.getName(), apiKeysCommand)
  .command(envCommand.getName(), envCommand)
  .command(recipeProcessingCommand.getName(), recipeProcessingCommand)
  .command(sourceAdaptersCommand.getName(), sourceAdaptersCommand)
  .command(utilsCommand.getName(), utilsCommand)

const logger = createLogger()
const adapters = withSelectedDependencies({ logger }, createAdapters)

withDependencies({ logger, adapters }, async () => {
  await mainCommand.parse(Deno.args)
})
