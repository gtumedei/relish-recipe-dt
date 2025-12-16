import { Command } from "@cliffy/command"

const listDishesCommand = new Command()
  .name("")
  .description("")
  .action(() => {})

const findDishCommand = new Command()
  .name("")
  .description("")
  .action(() => {})

const listRecipesCommand = new Command()
  .name("")
  .description("")
  .action(() => {})

const findRecipeCommand = new Command()
  .name("")
  .description("")
  .action(() => {})

const listUserRecipesCommand = new Command()
  .name("")
  .description("")
  .action(() => {})

const findUserRecipeCommand = new Command()
  .name("")
  .description("")
  .action(() => {})

export const storageCommand = new Command()
  .name("storage")
  .description("Read data from the Relish database.")
  .action(() => {
    console.log(storageCommand.getHelp())
  })
  .command(listDishesCommand.getName(), listDishesCommand)
  .command(findDishCommand.getName(), findDishCommand)
  .command(listRecipesCommand.getName(), listRecipesCommand)
  .command(findRecipeCommand.getName(), findRecipeCommand)
  .command(listUserRecipesCommand.getName(), listUserRecipesCommand)
  .command(findUserRecipeCommand.getName(), findUserRecipeCommand)
