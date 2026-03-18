import { Command } from "@cliffy/command"
import { SdkError } from "@relish/sdk"
import { ApiKey } from "@relish/storage"
import * as c from "@std/fmt/colors"
import { dedent } from "@std/text/unstable-dedent"
import { container } from "~/cli.container.ts"

const { sdk } = container

const listKeysCommand = new Command()
  .name("list")
  .description("List API keys.")
  .action(async () => {
    const keys = await sdk.apiKeys.list()
    console.log(keys.map((k) => apiKeyToString(k)).join("\n\n"))
  })

const getKeyCommand = new Command()
  .name("get")
  .description("Get info about an API key.")
  .arguments("<key:string>")
  .action(async (_, key) => {
    try {
      const res = await sdk.apiKeys.get({ key })
      console.dir(apiKeyToString(res))
    } catch (e) {
      if (e instanceof SdkError && e.code == "NOT_FOUND") return
      throw e
    }
  })

const createKeyCommand = new Command()
  .name("create")
  .description("Create a new API key.")
  .option("-n, --name <value:string>", "New name for the key", { required: true })
  .option(
    "-a, --access <value:string>",
    "Access rules string. Example:\ncollection1:CREATE,READ,UPDATE,DELETE\ncollection2:CREATE",
    { required: true },
  )
  .action(async ({ name, access }) => {
    const parsedAccess = parseAccessRuleString(access)
    const key = await sdk.apiKeys.create({ data: { name, access: parsedAccess } })
    console.log(`${c.green("✓")} API key created\n\n  ${key.key}`)
  })

const updateKeyCommand = new Command()
  .name("update")
  .description("Update an API key.")
  .option("-n, --name <value:string>", "New name for the key")
  .option("-a, --access <value:string>", "Access JSON as a string")
  .arguments("<key:string>")
  .action(async ({ name, access }, key) => {
    const k = await sdk.apiKeys.get({ key })
    await sdk.apiKeys.update({
      key,
      data: {
        name: name ?? k.name,
        access: access ? parseAccessRuleString(access) : k.access,
      },
    })
    console.log(`${c.green("✓")} API key updated`)
  })

const deleteKeyCommand = new Command()
  .name("delete")
  .description("Delete an API key by id.")
  .arguments("<key:string>")
  .action(async (_, key) => {
    await sdk.apiKeys.delete({ key })
    console.log(`${c.green("✓")} API key deleted`)
  })

export const apiKeysCommand = new Command()
  .name("api-keys")
  .description("Manage API keys.")
  .action(() => {
    console.log(apiKeysCommand.getHelp())
  })
  .command(listKeysCommand.getName(), listKeysCommand)
  .command(getKeyCommand.getName(), getKeyCommand)
  .command(createKeyCommand.getName(), createKeyCommand)
  .command(updateKeyCommand.getName(), updateKeyCommand)
  .command(deleteKeyCommand.getName(), deleteKeyCommand)

const parseAccessRuleString = (access: string) =>
  access
    .split("\n")
    .map((row) => row.trim().replaceAll(" ", ""))
    .filter(Boolean)
    .map((row) => {
      const [collection, rules] = row.split(":")
      return {
        collection,
        rules: rules.split(",").toSorted() as any,
      }
    })

const apiKeyToString = (key: ApiKey) => dedent`
  🔑 Name: ${key.name}
     Key: ${c.brightYellow(key.key)}
     Access:
     ${key.access.map((it) => `  ${it.collection}: ${it.rules.join(", ")}`).join("\n     ")}
     Created: ${key.createdAt}`
