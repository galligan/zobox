import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
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
    destinations: {
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

  it("returns invalid for store_only destination", () => {
    const result = validateDestination("store_only", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("store_only destination");
    }
  });

  it("returns invalid for empty destination name", () => {
    const result = validateDestination("", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("store_only destination");
    }
  });

  it("returns invalid when routesConfig is undefined", () => {
    const result = validateDestination("test_destination", undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'destination "test_destination" requested but no routes.json loaded'
      );
    }
  });

  it("returns invalid when destination does not exist", () => {
    const result = validateDestination("nonexistent", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'destination "nonexistent" not found in routes.json'
      );
    }
  });

  it("returns invalid when destination is disabled", () => {
    const result = validateDestination("disabled_http", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('destination "disabled_http" is disabled');
    }
  });

  it("returns invalid when destination is noop kind", () => {
    const result = validateDestination("noop_profile", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'destination "noop_profile" is not an HTTP destination or missing url'
      );
    }
  });

  it("returns invalid when HTTP destination has no url", () => {
    const result = validateDestination("no_url", mockDestinationsConfig);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(
        'destination "no_url" is not an HTTP destination or missing url'
      );
    }
  });

  it("returns valid for enabled HTTP destination with url", () => {
    const result = validateDestination("enabled_http", mockDestinationsConfig);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.destination).toEqual(
        mockDestinationsConfig.destinations.enabled_http
      );
    }
  });

  it("returns valid for minimal HTTP destination (defaults to enabled)", () => {
    const result = validateDestination("minimal_http", mockDestinationsConfig);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.destination.url).toBe("https://example.com/webhook");
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

  it("returns error when destination has no url", async () => {
    const destination: Destination = {
      kind: "http",
      enabled: true,
    };

    const result = await invokeHttpProfile(
      "test_destination",
      destination,
      mockEnvelope
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Destination missing URL");
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
    destinations: {
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
    vi.spyOn(logger, "warn").mockImplementation(() => {
      // suppress structured log output during tests
    });
  });

  it("skips routing for store_only destination without warning", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("store_only", mockEnvelope, mockDestinationsConfig);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs warning when routes config is missing", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("test_destination", mockEnvelope, undefined);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Destination validation failed", {
      destinationName: "test_destination",
      reason:
        'destination "test_destination" requested but no routes.json loaded',
      itemId: mockEnvelope.id,
    });
  });

  it("logs warning when destination is not found", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem(
      "missing_destination",
      mockEnvelope,
      mockDestinationsConfig
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Destination validation failed", {
      destinationName: "missing_destination",
      reason: 'destination "missing_destination" not found in routes.json',
      itemId: mockEnvelope.id,
    });
  });

  it("skips routing for disabled destination without invoking HTTP", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("disabled_profile", mockEnvelope, mockDestinationsConfig);

    expect(mockFetch).not.toHaveBeenCalled();
    // Should not warn because disabled destinations fail validation silently
  });

  it("invokes HTTP destination correctly when validation passes", async () => {
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
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs warning when HTTP invocation fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("good_profile", mockEnvelope, mockDestinationsConfig);

    expect(logger.warn).toHaveBeenCalledWith("Destination invocation failed", {
      destinationName: "good_profile",
      error: "HTTP 503 when sending to https://example.com/webhook",
      itemId: mockEnvelope.id,
    });
  });

  it("logs warning when network error occurs", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("Connection refused"));
    global.fetch = mockFetch as unknown as typeof fetch;

    await routeItem("good_profile", mockEnvelope, mockDestinationsConfig);

    expect(logger.warn).toHaveBeenCalledWith("Destination invocation failed", {
      destinationName: "good_profile",
      error: "Connection refused",
      itemId: mockEnvelope.id,
    });
  });
});
