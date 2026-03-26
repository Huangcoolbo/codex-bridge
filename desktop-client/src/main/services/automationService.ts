import type {
  CommandDraft,
  CommandExecutionRequest,
  CommandExecutionResult,
  CommandRunRequest,
  CommandShell
} from "@shared/contracts"

import { executeProfile } from "./bridgeService"
import { getCurrentTarget, setCurrentTarget } from "./sessionService"

const defaultShell: CommandShell = "powershell"

let lastCommandDraft: CommandDraft = {
  target: "localhost",
  shell: defaultShell,
  command: "Get-Process | Select-Object -First 5",
  passwordOverride: null
}

let lastCommandResult: CommandExecutionResult | null = null

function resolveShell(shell?: CommandShell): CommandShell {
  return shell ?? defaultShell
}

function failureResult(input: { target: string, shell: CommandShell, command: string }, stderr: string): CommandExecutionResult {
  return {
    success: false,
    stdout: "",
    stderr,
    exit_code: 1,
    target: input.target,
    shell: input.shell,
    command: input.command,
    raw: null
  }
}

function normalizeResult(
  request: { target: string, shell: CommandShell, command: string },
  raw: Record<string, unknown>
): CommandExecutionResult {
  const exitCode = typeof raw.exit_code === "number"
    ? raw.exit_code
    : typeof raw.exitCode === "number"
      ? raw.exitCode
      : 0
  const success = typeof raw.success === "boolean" ? raw.success : exitCode === 0

  return {
    success,
    stdout: typeof raw.stdout === "string" ? raw.stdout : "",
    stderr: typeof raw.stderr === "string" ? raw.stderr : "",
    exit_code: exitCode,
    target: request.target,
    shell: request.shell,
    command: request.command,
    raw
  }
}

function ensureExecutableRequest(input: CommandRunRequest | CommandExecutionRequest): CommandDraft {
  const sessionTarget = getCurrentTarget()?.target ?? ""
  const target = input.target?.trim() || sessionTarget || lastCommandDraft.target
  const command = input.command?.trim() || lastCommandDraft.command
  const shell = resolveShell(input.shell ?? lastCommandDraft.shell)
  const passwordOverride = input.passwordOverride ?? lastCommandDraft.passwordOverride ?? null

  return {
    target,
    shell,
    command,
    passwordOverride
  }
}

export function setCommandDraft(command: string, target?: string, shell?: CommandShell, passwordOverride?: string): CommandDraft {
  const sessionTarget = getCurrentTarget()?.target ?? ""
  lastCommandDraft = {
    target: target?.trim() || sessionTarget || lastCommandDraft.target,
    shell: resolveShell(shell ?? lastCommandDraft.shell),
    command: command.trim(),
    passwordOverride: passwordOverride ?? lastCommandDraft.passwordOverride ?? null
  }
  if (lastCommandDraft.target) {
    setCurrentTarget(lastCommandDraft.target)
  }
  return { ...lastCommandDraft }
}

export function getCommandDraft(): CommandDraft {
  return { ...lastCommandDraft }
}

export function getLastCommandResult(): CommandExecutionResult | null {
  return lastCommandResult ? { ...lastCommandResult } : null
}

export async function runCommand(input: CommandRunRequest = {}): Promise<CommandExecutionResult> {
  const request = ensureExecutableRequest(input)
  lastCommandDraft = { ...request }
  if (request.target) {
    setCurrentTarget(request.target)
  }

  if (!request.target) {
    lastCommandResult = failureResult(request, "No target selected.")
    return lastCommandResult
  }

  if (!request.command) {
    lastCommandResult = failureResult(request, "No command provided.")
    return lastCommandResult
  }

  if (request.shell !== "powershell") {
    lastCommandResult = failureResult(
      request,
      `Unsupported shell: ${request.shell}. Only powershell is currently available for Windows targets.`
    )
    return lastCommandResult
  }

  const raw = await executeProfile(request.target, request.command, request.passwordOverride ?? undefined)
  lastCommandResult = normalizeResult(request, raw)
  return lastCommandResult
}

export function executeCommand(input: CommandExecutionRequest): Promise<CommandExecutionResult> {
  return runCommand(input)
}
