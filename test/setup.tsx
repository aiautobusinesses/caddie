import "@testing-library/jest-dom/vitest"
import { afterEach, beforeEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.useRealTimers()
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

vi.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({ variable: "font-plus-jakarta" }),
  Lora: () => ({ variable: "font-lora" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}))

class MockCustomEvent<T = unknown> extends Event {
  detail: T | undefined

  constructor(type: string, init?: CustomEventInit<T>) {
    super(type, init)
    this.detail = init?.detail
  }
}

globalThis.CustomEvent = MockCustomEvent as unknown as typeof CustomEvent

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
})

Object.defineProperty(window, "atob", {
  writable: true,
  value: (value: string) => Buffer.from(value, "base64").toString("binary"),
})

Object.defineProperty(globalThis, "Notification", {
  configurable: true,
  writable: true,
  value: {
    permission: "default",
    requestPermission: vi.fn(async () => "granted"),
  },
})

Object.defineProperty(globalThis, "navigator", {
  writable: true,
  value: {
    serviceWorker: {
      register: vi.fn(async () => ({
        pushManager: { subscribe: vi.fn() },
        showNotification: vi.fn(),
      })),
      getRegistration: vi.fn(async () => null),
      ready: Promise.resolve(),
    },
  },
})

Object.defineProperty(globalThis, "fetch", {
  writable: true,
  value: vi.fn(),
})
