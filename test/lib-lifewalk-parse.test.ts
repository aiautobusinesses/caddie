import { describe, expect, it, vi, beforeEach } from "vitest"
import { extractThingsFromNarration } from "@/lib/lifewalk-parse"
import type Anthropic from "@anthropic-ai/sdk"

vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn()
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  class APIError extends Error {
    status: number | null
    constructor(msg: string, status: number | null = 500) {
      super(msg)
      this.name = "APIError"
      this.status = status
    }
  }
  MockAnthropic.APIError = APIError
  return { default: MockAnthropic }
})

async function getMockCreate() {
  const { default: AnthropicCtor } = await import("@anthropic-ai/sdk")
  const inst = new (AnthropicCtor as unknown as new () => { messages: { create: ReturnType<typeof vi.fn> } })()
  return inst.messages.create
}

async function makeMockClient(): Promise<Anthropic> {
  const { default: AnthropicCtor } = await import("@anthropic-ai/sdk")
  return new (AnthropicCtor as unknown as new () => Anthropic)()
}

const VALID_THING = {
  name: "Fix bike",
  class: "project",
  domain: "other",
  due_date: null,
  notify_window: null,
  notify_time_of_day: null,
  notify_escalate: false,
  steps: [{ name: "Patch tyre", band: "short", mode: "doing", shape: "clean", needs_know_how: false }],
}

describe("extractThingsFromNarration", () => {
  beforeEach(async () => {
    const create = await getMockCreate()
    create.mockReset()
  })

  it("returns parsed things on success", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify([VALID_THING]) }],
    })
    const result = await extractThingsFromNarration(await makeMockClient(), "fix my bike")
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Fix bike")
  })

  it("throws when the response has no text block", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [] })
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "Unexpected response from AI",
    )
  })

  it("throws a user-friendly message when model returns unparseable JSON (isParseError via 'JSON' keyword)", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "not valid json at all" }] })
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "Could not parse your narration",
    )
  })

  it("throws a user-friendly message when model returns empty JSON array (isParseError via 'No valid things')", async () => {
    // "[]" → parseLifeWalkThingsFromModelText throws "No valid things in model response"
    // msg.includes("JSON") = false, msg.includes("No valid things") = true → isParseError = true
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "Could not parse your narration",
    )
  })

  it("rethrows APIError that is not a model deprecation error", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const apiErr = new APIError("rate limited", 429)
    create.mockRejectedValue(apiErr)
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow("rate limited")
  })

  it("throws a user-friendly message for a deprecated model (status 400 + 'deprecated')", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const deprecatedErr = new APIError("model deprecated", 400)
    create.mockRejectedValue(deprecatedErr)
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "has been retired by Anthropic",
    )
  })

  it("throws a user-friendly message for a retired model (status 400 + 'retired')", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const retiredErr = new APIError("model retired by anthropic", 400)
    create.mockRejectedValue(retiredErr)
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "has been retired by Anthropic",
    )
  })

  it("throws a user-friendly message for 'no longer available' model (status 400)", async () => {
    // Covers line 228: msg.includes("no longer available") branch
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const noLongerAvailableErr = new APIError("this model is no longer available", 400)
    create.mockRejectedValue(noLongerAvailableErr)
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "has been retired by Anthropic",
    )
  })

  it("rethrows non-deprecated 400 APIError as-is", async () => {
    // isModelDeprecatedError: status = 400 but message has no deprecation keyword → false → re-throw
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const nonDeprecatedErr = new APIError("invalid request body", 400)
    create.mockRejectedValue(nonDeprecatedErr)
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "invalid request body",
    )
  })

  it("wraps non-APIError thrown as Error message", async () => {
    const create = await getMockCreate()
    create.mockRejectedValue(new Error("network failure"))
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow("network failure")
  })

  it("wraps non-Error thrown with generic message", async () => {
    const create = await getMockCreate()
    create.mockRejectedValue("raw string error")
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow("AI request failed")
  })

  it("throws TimeoutError as user-friendly message", async () => {
    const create = await getMockCreate()
    const timeoutErr = new Error("timed out")
    timeoutErr.name = "TimeoutError"
    create.mockRejectedValue(timeoutErr)
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "AI request timed out",
    )
  })

  it("throws AbortError as user-friendly message", async () => {
    const create = await getMockCreate()
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    create.mockRejectedValue(abortErr)
    await expect(extractThingsFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "AI request timed out",
    )
  })
})
