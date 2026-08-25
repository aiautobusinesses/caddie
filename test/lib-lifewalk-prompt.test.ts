import { describe, expect, it } from "vitest"
import { LIFEWALK_MODEL, LIFEWALK_EXTRACTION_PROMPT } from "@/lib/lifewalk-prompt"

describe("lifewalk-prompt exports", () => {
  it("exports a non-empty model name", () => {
    expect(typeof LIFEWALK_MODEL).toBe("string")
    expect(LIFEWALK_MODEL.length).toBeGreaterThan(0)
  })

  it("exports a non-empty extraction prompt", () => {
    expect(typeof LIFEWALK_EXTRACTION_PROMPT).toBe("string")
    expect(LIFEWALK_EXTRACTION_PROMPT.length).toBeGreaterThan(0)
  })
})
