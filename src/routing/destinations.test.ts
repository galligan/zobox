import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Destination,
  DestinationsConfig,
  MessageEnvelope,
} from "../types";
import {
  invokeHttpProfile,
  routeItem,
  validateDestination,
} from "./destinations";

describe("validateDestination", () => {
  const mockDestinationsConfig: DestinationsConfig = {
    profiles: {
      enabled_http: {
        kind: "http",
        url: "https://example.com/webhook",
        enabled: true,
      },
      disabled_http: {
        kind: "http",
        url: "https://example.com/webhook",
        enabled: false,
      },
      noop_profile: {
        kind: "noop",
        enabled: true,
      },
      no_url: {
        kind: "http",
        enabled: true,
      },
      minimal_http: {
        kind: "http",
        enabled: true,
        url: "https://example.com/webhook",
      },
    },
  };

  it("returns invalid for store_only profile", () => {
    const result = validateDestination("store_only", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("store_only profile");
    }
  });

  it("returns invalid for empty profile name", () => {
    const result = validateDestination("", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("store_only profile");
    }
  });

  it("returns invalid when routesConfig is undefined", () => {
    const result = validateDestination("test_profile", undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'route profile "test_profile" requested but no routes.json loaded'
      );
    }
  });

  it("returns invalid when profile does not exist", () => {
    const result = validateDestination("nonexistent", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'route profile "nonexistent" not found in routes.json'
      );
    }
  });

  it("returns invalid when profile is disabled", () => {
    const result = validateDestination("disabled_http", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('route profile "disabled_http" is disabled');
    }
  });

  it("returns invalid when profile is noop kind", () => {
    const result = validateDestination("noop_profile", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'route profile "noop_profile" is not an HTTP profile or missing url'
      );
    }
  });

  it("returns invalid when HTTP profile has no url", () => {
    const result = validateDestination("no_url", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'route profile "no_url" is not an HTTP profile or missing url'
      );
    }
  });

  it("returns valid for enabled HTTP profile with url", () => {
    const result = validateDestination("enabled_http", mockDestinationsConfig);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.profile).toEqual(
        mockDestinationsConfig.profiles.enabled_http
      );
    }
  });

  it("returns valid for minimal HTTP profile (defaults to enabled)", () => {
    const result = validateDestination("minimal_http", mockDestinationsConfig);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.profile.url).toBe("https://example.com/webhook");
    }
  });
});

describe("invokeHttpProfile", () => {
  const mockEnvelope: MessageEnvelope = {
    id: "test-123",
    type: "test",
    channel: "TestChannel",
    payload: { title: "Test Item" },
    attachments: [],
    createdAt: "2025-01-01T12:00:00Z",
    tags: [],
  };

  beforeEach(() => {
    // Reset fetch mock before each test
    vi.restoreAllMocks();
  });

  it("makes POST request with correct headers and body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const profile: Destination = {
      kind: "http",
      url: "https://example.com/webhook",
      enabled: true,
    };

    const result = await invokeHttpProfile(
      "test_profile",
      profile,
      mockEnvelope
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe(200);
    }

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
        }),
        body: JSON.stringify(mockEnvelope),
      })
    );
  });

  it("uses custom HTTP method when specified", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const profile: Destination = {
      kind: "http",
      url: "https://example.com/webhook",
      method: "PUT",
      enabled: true,
    };

    await invokeHttpProfile("test_profile", profile, mockEnvelope);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "PUT",
      })
    );
  });

  it("merges custom headers with default content-type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const profile: Destination = {
      kind: "http",
      url: "https://example.com/webhook",
      headers: {
        "X-Custom-Header": "test-value",
        Authorization: "Bearer token123",
      },
      enabled: true,
    };

    await invokeHttpProfile("test_profile", profile, mockEnvelope);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          "X-Custom-Header": "test-value",
          Authorization: "Bearer token123",
        },
      })
    );
  });

  it("returns error when response is not ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const profile: Destination = {
      kind: "http",
      url: "https://example.com/webhook",
      enabled: true,
    };

    const result = await invokeHttpProfile(
      "test_profile",
      profile,
      mockEnvelope
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "HTTP 500 when sending to https://example.com/webhook"
      );
    }
  });

  it("handles network errors gracefully", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("Network request failed"));
    global.fetch = mockFetch as unknown as typeof fetch;

    const profile: Destination = {
      kind: "http",
      url: "https://example.com/webhook",
      enabled: true,
    };

    const result = await invokeHttpProfile(
      "test_profile",
      profile,
      mockEnvelope
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Network request failed");
    }
  });

  it("handles timeout errors when timeoutMs is set", async () => {
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => {
            const abortError = new Error("The operation was aborted");
            abortError.name = "AbortError";
            reject(abortError);
          }, 100);
        })
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    const profile: Destination = {
      kind: "http",
      url: "https://example.com/webhook",
      enabled: true,
      timeoutMs: 50,
    };

    const result = await invokeHttpProfile(
      "test_profile",
      profile,
      mockEnvelope
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Request timeout after 50ms");
    }
  });

  it("handles non-Error exceptions", async () => {
    const mockFetch = vi.fn().mockRejectedValue("String error");
    global.fetch = mockFetch as unknown as typeof fetch;

    const profile: Destination = {
      kind: "http",
      url: "https://example.com/webhook",
      enabled: true,
    };

    const result = await invokeHttpProfile(
      "test_profile",
      profile,
      mockEnvelope
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("String error");
    }
  });

  it("returns error when profile has no url", async () => {
    const profile: Destination = {
      kind: "http",
      enabled: true,
    };

    const result = await invokeHttpProfile(
      "test_profile",
      profile,
      mockEnvelope
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Profile missing URL");
    }
  });
});

describe("routeItem", () => {
  const mockEnvelope: MessageEnvelope = {
    id: "test-456",
    type: "test",
    channel: "TestChannel",
    payload: { title: "Test Item" },
    attachments: [],
    createdAt: "2025-01-01T12:00:00Z",
    tags: [],
  };

  const mockDestinationsConfig: DestinationsConfig = {
    profiles: {
      good_profile: {
        kind: "http",
        url: "https://example.com/webhook",
        enabled: true,
      },
      disabled_profile: {
        kind: "http",
        url: "https://example.com/webhook",
        enabled: false,
      },
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock console.warn to avoid noise in tests
    vi.spyOn(console, "warn").mockImplementation(() => {
      // Intentionally empty - we're suppressing console output in tests
    });
  });

  it("skips routing for store_only profile without warning", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("store_only", mockEnvelope, mockDestinationsConfig);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs warning when routes config is missing", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("test_profile", mockEnvelope, undefined);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[zobox] route profile "test_profile" requested but no routes.json loaded'
    );
  });

  it("logs warning when profile is not found", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("missing_profile", mockEnvelope, mockDestinationsConfig);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[zobox] route profile "missing_profile" not found in routes.json'
    );
  });

  it("skips routing for disabled profile without invoking HTTP", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("disabled_profile", mockEnvelope, mockDestinationsConfig);

    expect(mockFetch).not.toHaveBeenCalled();
    // Should not warn because disabled profiles fail validation silently
  });

  it("invokes HTTP profile correctly when validation passes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("good_profile", mockEnvelope, mockDestinationsConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(mockEnvelope),
      })
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs warning when HTTP invocation fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("good_profile", mockEnvelope, mockDestinationsConfig);

    expect(console.warn).toHaveBeenCalledWith(
      '[zobox] route "good_profile" failed: HTTP 503 when sending to https://example.com/webhook'
    );
  });

  it("logs warning when network error occurs", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("Connection refused"));
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("good_profile", mockEnvelope, mockDestinationsConfig);

    expect(console.warn).toHaveBeenCalledWith(
      '[zobox] route "good_profile" failed: Connection refused'
    );
  });
});
