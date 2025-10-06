import { Command, EnumType } from "@cliffy/command"
import { evaluateRecipeLikelihood } from "@relish/recipe-processing"
import { Spinner } from "@std/cli/unstable-spinner"
import * as c from "@std/fmt/colors"

const evaluateRecipeLikelihoodCommand = new Command()
  .name("evaluate-recipe-likelihood")
  .description(
    "Evaluate the likelihood for a social media post to be about a recipe based on its metadata."
  )
  .type("mode", new EnumType(["text", "file"]))
  .option("-m, --mode <mode:mode>", "Read metadata from text or file.", { required: true })
  .arguments("<metadata:string>")
  .action(async ({ mode }, metadataOrPath) => {
    const metadata = mode == "text" ? metadataOrPath : await Deno.readTextFile(metadataOrPath)
    const spinner = new Spinner({ message: "Evaluating recipe likelihood...", color: "blue" })
    spinner.start()
    const score = await evaluateRecipeLikelihood(metadata)
    spinner.stop()
    console.log(`${c.blue("→")} Result: ${score}/5`)
  })

export const recipeProcessingCommand = new Command()
  .name("recipe-processing")
  .description("Process recipes.")
  .action(() => {
    console.log(recipeProcessingCommand.getHelp())
  })
  .command(evaluateRecipeLikelihoodCommand.getName(), evaluateRecipeLikelihoodCommand)
