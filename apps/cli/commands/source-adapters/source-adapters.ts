import { Command } from "@cliffy/command"
import { youtubeCommand } from "~/commands/source-adapters/youtube.ts"

export const sourceAdaptersCommand = new Command()
  .name("source-adapters")
  .description("Download food content from online sources.")
  .action(() => {
    console.log(sourceAdaptersCommand.getHelp())
  })
  .command(youtubeCommand.getName(), youtubeCommand)
