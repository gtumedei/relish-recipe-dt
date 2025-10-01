export const executeCommand = async (command: string, ...args: string[]) => {
  const cmd = new Deno.Command(command, { args: args })
  const { success, code, stdout: stdoutBuff, stderr: stderrBuff } = await cmd.output()
  const decoder = new TextDecoder()
  const stdout = decoder.decode(stdoutBuff)
  const stderr = decoder.decode(stderrBuff)
  if (!success) throw new CommandError({ code, stdout, stderr })
  return { stdout, stderr }
}

export class CommandError extends Error {
  code: number
  stdout?: string
  stderr?: string

  constructor(params: { code: number; stdout?: string; stderr?: string }) {
    super("Command completed with errors")
    this.code = params.code
    this.stdout = params.stdout
    this.stderr = params.stderr
  }
}
