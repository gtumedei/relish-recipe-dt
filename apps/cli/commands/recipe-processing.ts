import { Command, EnumType } from "@cliffy/command"
import { evaluateRecipeLikelihood, extractRecipe } from "@relish/recipe-processing"
import { Spinner } from "@std/cli/unstable-spinner"
import * as c from "@std/fmt/colors"

const evaluateRecipeLikelihoodCommand = new Command()
  .name("evaluate-recipe-likelihood")
  .description(
    "Evaluate the likelihood for a social media post to be about a recipe based on its metadata."
  )
  .type("source", new EnumType(["text", "file"]))
  .option("-s, --source <source:source>", "Read metadata from text or file.", { required: true })
  .arguments("<metadata:string>")
  .action(async ({ source }, metadataOrPath) => {
    const metadata = source == "text" ? metadataOrPath : await Deno.readTextFile(metadataOrPath)
    const spinner = new Spinner({ message: "Evaluating recipe likelihood...", color: "blue" })
    spinner.start()
    const score = await evaluateRecipeLikelihood(metadata)
    spinner.stop()
    console.log(`${c.blue("→")} Result: ${score}/5`)
  })

const extractRecipeCommand = new Command()
  .name("extract-recipe")
  .description("Extract a structured recipe from an unstructured body of text.")
  .type("source", new EnumType(["text", "file"]))
  .option("-s, --source <source:source>", "Read content from text or file.", { required: true })
  .arguments("<content:string>")
  .action(async ({ source }, contentOrPath) => {
    const content = source == "text" ? contentOrPath : await Deno.readTextFile(contentOrPath)
    const res = await extractRecipe(content)
    console.log(`${c.blue("→")} Result:\n`)
    console.log(JSON.stringify(res, null, 2))
  })

export const recipeProcessingCommand = new Command()
  .name("recipe-processing")
  .description("Process recipes.")
  .action(() => {
    console.log(recipeProcessingCommand.getHelp())
  })
  .command(evaluateRecipeLikelihoodCommand.getName(), evaluateRecipeLikelihoodCommand)
  .command(extractRecipeCommand.getName(), extractRecipeCommand)
