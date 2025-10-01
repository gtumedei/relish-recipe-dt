export const executeCommand = async (command: string, ...args: string[]) => {
  const cmd = new Deno.Command(command, { args: args })
  const { success, code, stdout, stderr } = await cmd.output()
  const decoder = new TextDecoder()
  return {
    success,
    code,
    stdout: decoder.decode(stdout),
    stderr: decoder.decode(stderr),
  }
}
