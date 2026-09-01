import { describe, expect, it, vi, beforeEach } from "vitest"
import { extractFromNarration, parseLifeWalkResultFromModelText } from "@/lib/lifewalk-parse"
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

const VALID_ENTITY = {
  name: "Peace lily",
  kind: "plant",
  location: "bedroom",
  action: "Water",
  intervals: { "1": 14, "2": 14, "3": 10, "4": 7, "5": 7, "6": 7, "7": 7, "8": 7, "9": 10, "10": 14, "11": 14, "12": 14 },
  tolerance_days: 2,
  overdue_days: 5,
}

const VALID_PAYLOAD = { things: [VALID_THING], entities: [VALID_ENTITY] }

describe("parseLifeWalkResultFromModelText", () => {
  it("parses a well-formed payload with things and entities", () => {
    const result = parseLifeWalkResultFromModelText(JSON.stringify(VALID_PAYLOAD))
    expect(result.things).toHaveLength(1)
    expect(result.things[0].name).toBe("Fix bike")
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].name).toBe("Peace lily")
    expect(result.entities[0].intervals["1"]).toBe(14)
    expect(result.entities_dropped).toBe(0)
  })

  it("accepts a payload with only things and an empty entities array", () => {
    const result = parseLifeWalkResultFromModelText(JSON.stringify({ things: [VALID_THING], entities: [] }))
    expect(result.things).toHaveLength(1)
    expect(result.entities).toHaveLength(0)
    expect(result.entities_dropped).toBe(0)
  })

  it("accepts a payload with only entities and an empty things array", () => {
    const result = parseLifeWalkResultFromModelText(JSON.stringify({ things: [], entities: [VALID_ENTITY] }))
    expect(result.things).toHaveLength(0)
    expect(result.entities).toHaveLength(1)
    expect(result.entities_dropped).toBe(0)
  })

  it("counts an entity with invalid intervals as a parse-time drop", () => {
    // Eleven months instead of twelve — the realistic LLM failure case.
    const elevenMonths = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i + 1), 7]))
    const bad = { ...VALID_ENTITY, intervals: elevenMonths }
    const result = parseLifeWalkResultFromModelText(JSON.stringify({ things: [VALID_THING], entities: [bad] }))
    expect(result.entities).toHaveLength(0)
    expect(result.entities_dropped).toBe(1)
  })

  it("counts an entity with wrong interval value types as a parse-time drop", () => {
    const bad = { ...VALID_ENTITY, intervals: { "1": "not-a-number" } }
    const result = parseLifeWalkResultFromModelText(JSON.stringify({ things: [VALID_THING], entities: [bad] }))
    expect(result.entities).toHaveLength(0)
    expect(result.entities_dropped).toBe(1)
  })

  it("counts a nameless entity as a parse-time drop", () => {
    // A well-formed object with a blank name is still a model output failure.
    const bad = { ...VALID_ENTITY, name: "" }
    const result = parseLifeWalkResultFromModelText(JSON.stringify({ things: [VALID_THING], entities: [bad] }))
    expect(result.entities).toHaveLength(0)
    expect(result.entities_dropped).toBe(1)
  })

  it("throws when both arrays are empty after normalisation", () => {
    expect(() =>
      parseLifeWalkResultFromModelText(JSON.stringify({ things: [], entities: [] })),
    ).toThrow("No valid things in model response")
  })

  it("throws when the model returns a plain array instead of an object", () => {
    expect(() =>
      parseLifeWalkResultFromModelText(JSON.stringify([VALID_THING])),
    ).toThrow("No JSON object found in model response")
  })

  it("throws on unparseable text", () => {
    expect(() => parseLifeWalkResultFromModelText("not json at all")).toThrow(
      "No JSON object found in model response",
    )
  })

  it("strips markdown code fences before parsing", () => {
    const text = "```json\n" + JSON.stringify(VALID_PAYLOAD) + "\n```"
    const result = parseLifeWalkResultFromModelText(text)
    expect(result.things).toHaveLength(1)
    expect(result.entities).toHaveLength(1)
  })
  it("coerces obligation with no due_date to project", () => {
    const undatedObligation = {
      ...VALID_THING,
      class: "obligation",
      due_date: null,
      notify_window: null,
    }
    const result = parseLifeWalkResultFromModelText(JSON.stringify({ things: [undatedObligation], entities: [] }))
    expect(result.things).toHaveLength(1)
    expect(result.things[0].class).toBe("project")
  })

  it("keeps obligation with a due_date as obligation", () => {
    const datedObligation = {
      ...VALID_THING,
      class: "obligation",
      due_date: "2026-03-15",
      notify_window: 14,
    }
    const result = parseLifeWalkResultFromModelText(JSON.stringify({ things: [datedObligation], entities: [] }))
    expect(result.things).toHaveLength(1)
    expect(result.things[0].class).toBe("obligation")
  })
})

describe("extractFromNarration", () => {
  beforeEach(async () => {
    const create = await getMockCreate()
    create.mockReset()
  })

  it("returns parsed things and entities on success", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(VALID_PAYLOAD) }],
    })
    const result = await extractFromNarration(await makeMockClient(), "fix my bike, water peace lily")
    expect(result.things).toHaveLength(1)
    expect(result.things[0].name).toBe("Fix bike")
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].name).toBe("Peace lily")
    expect(result.entities_dropped).toBe(0)
  })

  it("throws when the response has no text block", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [] })
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "Unexpected response from AI",
    )
  })

  it("throws a user-friendly message when model returns unparseable JSON (isParseError via 'JSON' keyword)", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "not valid json at all" }] })
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "Could not parse your narration",
    )
  })

  it("throws a user-friendly message when model returns empty payload (isParseError via 'No valid things')", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ things: [], entities: [] }) }] })
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
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
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow("rate limited")
  })

  it("throws a user-friendly message for a deprecated model (status 400 + 'deprecated')", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const deprecatedErr = new APIError("model deprecated", 400)
    create.mockRejectedValue(deprecatedErr)
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
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
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "has been retired by Anthropic",
    )
  })

  it("throws a user-friendly message for 'no longer available' model (status 400)", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const noLongerAvailableErr = new APIError("this model is no longer available", 400)
    create.mockRejectedValue(noLongerAvailableErr)
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "has been retired by Anthropic",
    )
  })

  it("rethrows non-deprecated 400 APIError as-is", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const nonDeprecatedErr = new APIError("invalid request body", 400)
    create.mockRejectedValue(nonDeprecatedErr)
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "invalid request body",
    )
  })

  it("wraps non-APIError thrown as Error message", async () => {
    const create = await getMockCreate()
    create.mockRejectedValue(new Error("network failure"))
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow("network failure")
  })

  it("wraps non-Error thrown with generic message", async () => {
    const create = await getMockCreate()
    create.mockRejectedValue("raw string error")
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow("AI request failed")
  })

  it("throws TimeoutError as user-friendly message", async () => {
    const create = await getMockCreate()
    const timeoutErr = new Error("timed out")
    timeoutErr.name = "TimeoutError"
    create.mockRejectedValue(timeoutErr)
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "AI request timed out",
    )
  })

  it("throws AbortError as user-friendly message", async () => {
    const create = await getMockCreate()
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    create.mockRejectedValue(abortErr)
    await expect(extractFromNarration(await makeMockClient(), "do stuff")).rejects.toThrow(
      "AI request timed out",
    )
  })
})
