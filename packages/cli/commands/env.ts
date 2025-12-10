import { Command } from "@cliffy/command"
import { env } from "@relish/env"

const loadEnvCommand = new Command()
  .name("load")
  .description("Load and print environment variables for the Relish DT.")
  .action(() => {
    console.log(env)
  })

export const envCommand = new Command()
  .name("env")
  .description("Work with evironment variables.")
  .action(() => {
    console.log(envCommand.getHelp())
  })
  .command(loadEnvCommand.getName(), loadEnvCommand)
