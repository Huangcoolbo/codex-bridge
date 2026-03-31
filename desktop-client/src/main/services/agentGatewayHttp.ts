import type { IncomingMessage, ServerResponse } from "node:http"

import type { RouteDefinition } from "./agentGatewayRouter"

export type JsonObject = Record<string, unknown>

export type RequestContext = {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  method: string
  pathname: string
  params: Record<string, string>
}

export type GatewayRouteDefinition = RouteDefinition & {
  handler: (context: RequestContext) => Promise<void> | void
}

export class HttpError extends Error {
  readonly statusCode: number
  readonly payload: unknown

  constructor(statusCode: number, payload: unknown) {
    super(typeof payload === "object" && payload && "error" in (payload as JsonObject)
      ? String((payload as JsonObject).error)
      : `HTTP ${statusCode}`)
    this.statusCode = statusCode
    this.payload = payload
  }
}

export function respondJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  })
  response.end(JSON.stringify(payload))
}

export function successEnvelope(data: unknown): JsonObject {
  return {
    success: true,
    stdout: "",
    stderr: "",
    exit_code: 0,
    data
  }
}

export function successErrorEnvelope(stderr: string): JsonObject {
  return {
    success: false,
    stdout: "",
    stderr,
    exit_code: 1,
    data: null
  }
}

export function respondWithResult(response: ServerResponse, result: { success?: boolean }): void {
  respondJson(response, result.success ? 200 : 400, result)
}

export function badRequest(payload: unknown): HttpError {
  return new HttpError(400, payload)
}

export function notFoundError(message: string): HttpError {
  return new HttpError(404, { success: false, error: message })
}

export function unauthorizedError(message: string): HttpError {
  return new HttpError(401, { success: false, error: message })
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) {
    return {} as T
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T
}

export async function readBody<T>(context: RequestContext): Promise<T> {
  try {
    return await readJsonBody<T>(context.request)
  } catch (error) {
    throw badRequest({
      success: false,
      error: error instanceof Error ? `Invalid JSON body: ${error.message}` : "Invalid JSON body"
    })
  }
}
