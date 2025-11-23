import { logger } from "../logger.js";
import type {
  Destination,
  DestinationsConfig,
  MessageEnvelope,
} from "../types";

/**
 * Result of route profile validation
 */
export type ValidateProfileResult =
  | { valid: true; profile: Destination }
  | { valid: false; reason: string };

/**
 * Result of HTTP profile invocation
 */
export type InvokeHttpResult =
  | { success: true; status: number }
  | { success: false; error: string };

/**
 * Validates that a route profile exists and is enabled.
 * Returns validation result with profile or reason for failure.
 *
 * @param profileName - Name of the route profile to validate
 * @param routesConfig - Routes configuration containing profiles
 * @returns Validation result with profile data or failure reason
 */
export function validateDestination(
  profileName: string,
  routesConfig?: DestinationsConfig
): ValidateProfileResult {
  // Store-only profiles always pass validation but don't need routing
  if (!profileName || profileName === "store_only") {
    return { valid: false, reason: "store_only profile" };
  }

  if (!routesConfig) {
    return {
      valid: false,
      reason: `route profile "${profileName}" requested but no routes.json loaded`,
    };
  }

  const profile = routesConfig.profiles[profileName];
  if (!profile) {
    return {
      valid: false,
      reason: `route profile "${profileName}" not found in routes.json`,
    };
  }

  if (profile.enabled === false) {
    return {
      valid: false,
      reason: `route profile "${profileName}" is disabled`,
    };
  }

  // Validate HTTP profile has required URL
  if ((profile.kind && profile.kind !== "http") || !profile.url) {
    return {
      valid: false,
      reason: `route profile "${profileName}" is not an HTTP profile or missing url`,
    };
  }

  return { valid: true, profile };
}

/**
 * Invokes an HTTP route profile by making a POST request with the envelope.
 *
 * @param _profileName - Name of the route profile (for logging, currently unused)
 * @param profile - Validated route profile configuration
 * @param envelope - Item envelope to send in request body
 * @returns Result of the HTTP invocation
 */
export async function invokeHttpProfile(
  _profileName: string,
  profile: Destination,
  envelope: MessageEnvelope
): Promise<InvokeHttpResult> {
  if (!profile.url) {
    return { success: false, error: "Profile missing URL" };
  }

  const method = (profile.method || "POST").toUpperCase();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(profile.headers ?? {}),
  };

  try {
    const controller = new AbortController();
    const timeoutId = profile.timeoutMs
      ? setTimeout(() => controller.abort(), profile.timeoutMs)
      : null;

    const res = await fetch(profile.url, {
      method,
      headers,
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      return {
        success: false,
        error: `HTTP ${res.status} when sending to ${profile.url}`,
      };
    }

    return { success: true, status: res.status };
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return {
          success: false,
          error: `Request timeout after ${profile.timeoutMs}ms`,
        };
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: String(err) };
  }
}

/**
 * Routes an item to its configured profile.
 * Orchestrates validation and HTTP invocation with proper logging.
 *
 * @param profileName - Name of the route profile to use
 * @param envelope - Item envelope to route
 * @param routesConfig - Optional routes configuration
 */
export async function routeItem(
  profileName: string,
  envelope: MessageEnvelope,
  routesConfig?: DestinationsConfig
): Promise<void> {
  const validation = validateDestination(profileName, routesConfig);

  if (!validation.valid) {
    // Only log warnings for actual failures, not store_only
    if (validation.reason !== "store_only profile") {
      logger.warn("Route profile validation failed", {
        profileName,
        reason: validation.reason,
        itemId: envelope.id,
      });
    }
    return;
  }

  const result = await invokeHttpProfile(
    profileName,
    validation.profile,
    envelope
  );

  if (!result.success) {
    logger.warn("Route profile invocation failed", {
      profileName,
      error: result.error,
      itemId: envelope.id,
    });
  }
}
