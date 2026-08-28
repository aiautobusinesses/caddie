import { describe, expect, it } from "vitest"
import { getLifewalkModel, LIFEWALK_MODEL_DEFAULT, LIFEWALK_EXTRACTION_PROMPT } from "@/lib/lifewalk-prompt"

describe("lifewalk-prompt exports", () => {
  it("default model name is a non-empty string", () => {
    expect(typeof LIFEWALK_MODEL_DEFAULT).toBe("string")
    expect(LIFEWALK_MODEL_DEFAULT.length).toBeGreaterThan(0)
  })

  it("getLifewalkModel returns a non-empty string", () => {
    const model = getLifewalkModel()
    expect(typeof model).toBe("string")
    expect(model.length).toBeGreaterThan(0)
  })

  it("getLifewalkModel respects ANTHROPIC_MODEL env override", () => {
    const original = process.env.ANTHROPIC_MODEL
    process.env.ANTHROPIC_MODEL = "claude-test-override"
    expect(getLifewalkModel()).toBe("claude-test-override")
    process.env.ANTHROPIC_MODEL = original
  })

  it("exports a non-empty extraction prompt", () => {
    expect(typeof LIFEWALK_EXTRACTION_PROMPT).toBe("string")
    expect(LIFEWALK_EXTRACTION_PROMPT.length).toBeGreaterThan(0)
  })
})
