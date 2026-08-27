import { describe, expect, it, vi, beforeEach } from "vitest"
import { seedCarePlan } from "@/lib/seed-care-plan"
import type Anthropic from "@anthropic-ai/sdk"

// Mock Anthropic at module level so hoisting works correctly
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn()
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  class APIError extends Error {
    status: number
    constructor(message: string, status = 500) {
      super(message)
      this.name = "APIError"
      this.status = status
    }
  }
  MockAnthropic.APIError = APIError
  return { default: MockAnthropic }
})

// Access the shared mock create fn via the module
async function getMockCreate() {
  const { default: AnthropicCtor } = await import("@anthropic-ai/sdk")
  // The factory returns a new instance on each call; the mockCreate is shared
  const instance = new (AnthropicCtor as unknown as new () => { messages: { create: ReturnType<typeof vi.fn> } })()
  return instance.messages.create
}

async function makeMockClient(): Promise<Anthropic> {
  const { default: AnthropicCtor } = await import("@anthropic-ai/sdk")
  return new (AnthropicCtor as unknown as new () => Anthropic)()
}

const VALID_RESPONSE = JSON.stringify({
  name: "Fiddle-leaf fig",
  kind: "plant",
  location: "front room",
  action: "Water",
  intervals: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7])),
  tolerance_days: 2,
  overdue_days: 7,
  note: null,
})

describe("seedCarePlan", () => {
  beforeEach(async () => {
    const create = await getMockCreate()
    create.mockReset()
  })

  it("returns parsed care plan on success", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: VALID_RESPONSE }] })
    const result = await seedCarePlan("fiddle-leaf fig in the front room", await makeMockClient())
    expect(result).toMatchObject({ name: "Fiddle-leaf fig", action: "Water", location: "front room" })
  })

  it("returns error when response has no text block", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [] })
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: "Unexpected response from AI" })
  })

  it("returns error on Anthropic.APIError", async () => {
    const { default: AnthropicCtor } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (AnthropicCtor as unknown as any).APIError
    create.mockRejectedValue(new APIError("rate limited", 429))
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: "rate limited" })
  })

  it("returns 'AI request failed' when Anthropic.APIError has empty message", async () => {
    const { default: AnthropicCtor } = await import("@anthropic-ai/sdk")
    const create = await getMockCreate()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (AnthropicCtor as unknown as any).APIError
    create.mockRejectedValue(new APIError("", 500))
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: "AI request failed" })
  })

  it("returns error on generic Error", async () => {
    const create = await getMockCreate()
    create.mockRejectedValue(new Error("network failure"))
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: "network failure" })
  })

  it("returns error on non-Error thrown value", async () => {
    const create = await getMockCreate()
    create.mockRejectedValue("raw string")
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: "AI request failed" })
  })

  it("returns error when JSON is invalid", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "not json" }] })
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: expect.stringContaining("parse") })
  })

  it("returns error when JSON is an array not an object", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: expect.stringContaining("parse") })
  })

  it("returns error when name is missing", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ kind: "plant", intervals: {} }) }] })
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: expect.stringContaining("name") })
  })

  it("returns error when intervals missing", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ name: "Thing", kind: "plant", intervals: "bad" }) }],
    })
    const result = await seedCarePlan("something", await makeMockClient())
    expect(result).toMatchObject({ error: expect.stringContaining("intervals") })
  })

  it("fills missing interval months with 7", async () => {
    const create = await getMockCreate()
    const partial = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i + 1), 10]))
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ name: "Thing", kind: "plant", intervals: partial }) }],
    })
    const result = await seedCarePlan("something", await makeMockClient())
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.intervals["12"]).toBe(7)
    }
  })

  it("strips markdown fences from response", async () => {
    const create = await getMockCreate()
    create.mockResolvedValue({
      content: [{ type: "text", text: "```json\n" + VALID_RESPONSE + "\n```" }],
    })
    const result = await seedCarePlan("fiddle-leaf fig", await makeMockClient())
    expect(result).toMatchObject({ name: "Fiddle-leaf fig" })
  })

  it("falls back to 'thing' when kind is not a string", async () => {
    const create = await getMockCreate()
    const intervals = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7]))
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ name: "Widget", kind: 42, location: null, action: "Fix", intervals, tolerance_days: 2, overdue_days: 7, note: null }) }],
    })
    const result = await seedCarePlan("widget", await makeMockClient())
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.kind).toBe("thing")
    }
  })

  it("falls back to null when location is not a string", async () => {
    const create = await getMockCreate()
    const intervals = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7]))
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ name: "Widget", kind: "thing", location: 99, action: "Fix", intervals, tolerance_days: 2, overdue_days: 7, note: null }) }],
    })
    const result = await seedCarePlan("widget", await makeMockClient())
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.location).toBeNull()
    }
  })

  it("trims empty string location to null", async () => {
    const create = await getMockCreate()
    const intervals = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7]))
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ name: "Widget", kind: "thing", location: "  ", action: "Fix", intervals, tolerance_days: 2, overdue_days: 7, note: null }) }],
    })
    const result = await seedCarePlan("widget", await makeMockClient())
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.location).toBeNull()
    }
  })

  it("trims empty string note to null", async () => {
    const create = await getMockCreate()
    const intervals = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7]))
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ name: "Widget", kind: "thing", location: null, action: "Fix", intervals, tolerance_days: 2, overdue_days: 7, note: "  " }) }],
    })
    const result = await seedCarePlan("widget", await makeMockClient())
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.note).toBeNull()
    }
  })
})
