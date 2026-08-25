import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  isPushSupported,
  registerServiceWorker,
  getNotificationPermission,
  showLocalTestNotification,
  requestPushPermission,
} from "@/lib/push"

// jsdom doesn't expose PushManager — stub it so isPushSupported() can return true/false
function stubPushManager(present: boolean) {
  if (present) {
    if (!("PushManager" in window)) {
      Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} })
    }
  } else {
    // Must delete so "PushManager" in window returns false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).PushManager
  }
}

// Use vi.stubGlobal to avoid "Cannot redefine property" on non-configurable globals in jsdom
function stubNotification(permission: NotificationPermission = "default", requestPermission?: () => Promise<string>) {
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: requestPermission ?? vi.fn(async () => "granted"),
  })
}

function stubNavigatorSW(overrides: {
  register?: () => Promise<unknown>
  getRegistration?: () => Promise<unknown>
}) {
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: overrides.register ?? vi.fn(async () => ({ pushManager: { subscribe: vi.fn() }, showNotification: vi.fn(async () => {}) })),
      getRegistration: overrides.getRegistration ?? vi.fn(async () => null),
      ready: Promise.resolve(),
    },
  })
}

beforeEach(() => {
  stubPushManager(true)
  stubNotification("default")
  stubNavigatorSW({})
})

// ═══════════════════════════════════════════════════════════════════════════════

describe("isPushSupported", () => {
  it("returns true when all APIs present", () => {
    expect(isPushSupported()).toBe(true)
  })

  it("returns false when navigator has no serviceWorker", () => {
    vi.stubGlobal("navigator", {})
    expect(isPushSupported()).toBe(false)
  })

  it("returns false when PushManager absent", () => {
    stubPushManager(false)
    expect(isPushSupported()).toBe(false)
  })
})

describe("getNotificationPermission", () => {
  it("returns current Notification.permission", () => {
    const result = getNotificationPermission()
    expect(["default", "granted", "denied"]).toContain(result)
  })
})

describe("registerServiceWorker", () => {
  it("calls navigator.serviceWorker.register and returns registration", async () => {
    const fakeReg = { pushManager: { subscribe: vi.fn() } }
    stubNavigatorSW({ register: vi.fn(async () => fakeReg) })
    const reg = await registerServiceWorker()
    expect(reg).toBe(fakeReg)
  })
})

describe("showLocalTestNotification", () => {
  it("returns ok:true when permission granted and service worker ready", async () => {
    const fakeReg = { showNotification: vi.fn(async () => {}) }
    stubNavigatorSW({
      register: vi.fn(async () => fakeReg),
      getRegistration: vi.fn(async () => fakeReg),
    })
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(true)
  })

  it("skips requestPermission when already granted (lib/push.ts:48)", async () => {
    // permission === "granted" already → the `if (permission === "default")` branch is false
    stubNotification("granted")
    const fakeReg = { showNotification: vi.fn(async () => {}) }
    stubNavigatorSW({
      register: vi.fn(async () => fakeReg),
      getRegistration: vi.fn(async () => fakeReg),
    })
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(true)
  })

  it("falls back to registerServiceWorker when getRegistration returns null (lib/push.ts:61)", async () => {
    // getRegistration() returns null → falls back to registerServiceWorker() result
    const fakeReg = { showNotification: vi.fn(async () => {}) }
    stubNavigatorSW({
      register: vi.fn(async () => fakeReg),
      getRegistration: vi.fn(async () => null), // null → triggers fallback
    })
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(true)
  })

  it("returns error when permission denied", async () => {
    stubNotification("default", vi.fn(async () => "denied"))
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/permission/i)
  })

  it("returns error when service worker registration is null", async () => {
    stubNavigatorSW({
      register: vi.fn(async () => null),
      getRegistration: vi.fn(async () => null),
    })
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/service worker/i)
  })

  it("returns error when showNotification throws", async () => {
    const fakeReg = { showNotification: vi.fn(async () => { throw new Error("sw error") }) }
    stubNavigatorSW({
      register: vi.fn(async () => fakeReg),
      getRegistration: vi.fn(async () => fakeReg),
    })
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(false)
    expect(result.error).toBe("sw error")
  })

  it("returns generic error string when non-Error thrown in showNotification", async () => {
    const fakeReg = { showNotification: vi.fn(async () => { throw "raw" }) }
    stubNavigatorSW({
      register: vi.fn(async () => fakeReg),
      getRegistration: vi.fn(async () => fakeReg),
    })
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Could not show notification")
  })
})

describe("requestPushPermission", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "dGVzdA")
  })

  it("returns false when push not supported (no serviceWorker)", async () => {
    vi.stubGlobal("navigator", {})
    const result = await requestPushPermission()
    expect(result).toBe(false)
  })

  it("returns false when VAPID key missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "")
    const result = await requestPushPermission()
    expect(result).toBe(false)
  })

  it("returns false when permission denied", async () => {
    stubNotification("default", vi.fn(async () => "denied"))
    const result = await requestPushPermission()
    expect(result).toBe(false)
  })

  it("returns false when registerServiceWorker returns null", async () => {
    stubNavigatorSW({ register: vi.fn(async () => null) })
    const result = await requestPushPermission()
    expect(result).toBe(false)
  })

  it("returns true when subscription posted successfully", async () => {
    const fakeSub = {
      toJSON: () => ({ endpoint: "https://push.example.com", keys: { p256dh: "a", auth: "b" } }),
    }
    const fakeReg = { pushManager: { subscribe: vi.fn(async () => fakeSub) } }
    stubNavigatorSW({
      register: vi.fn(async () => fakeReg),
      getRegistration: vi.fn(async () => fakeReg),
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))
    const result = await requestPushPermission()
    expect(result).toBe(true)
  })

  it("returns false when subscribe POST fails", async () => {
    const fakeSub = { toJSON: () => ({ endpoint: "https://push.example.com" }) }
    const fakeReg = { pushManager: { subscribe: vi.fn(async () => fakeSub) } }
    stubNavigatorSW({
      register: vi.fn(async () => fakeReg),
      getRegistration: vi.fn(async () => fakeReg),
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }))
    const result = await requestPushPermission()
    expect(result).toBe(false)
  })
})

describe("push: edge cases not covered elsewhere", () => {
  it("getNotificationPermission returns null when Notification is not in window", () => {
    // lib/push.ts line 33: !("Notification" in window)
    const orig = (window as unknown as Record<string, unknown>).Notification
    delete (window as unknown as Record<string, unknown>).Notification
    expect(getNotificationPermission()).toBeNull()
    ;(window as unknown as Record<string, unknown>).Notification = orig
  })

  it("registerServiceWorker returns null when isPushSupported is false", async () => {
    // Temporarily break navigator to make isPushSupported return false → line 25 returns null
    vi.stubGlobal("navigator", {})
    const result = await registerServiceWorker()
    expect(result).toBeNull()
  })

  it("showLocalTestNotification returns error when push not supported", async () => {
    // lib/push.ts line 44: !isPushSupported() → { ok: false, error: "Push is not supported..." }
    vi.stubGlobal("navigator", {})
    const result = await showLocalTestNotification()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not supported/i)
  })
})
