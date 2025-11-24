import { logger } from "../logger.js";
import type {
  Destination,
  DestinationsConfig,
  MessageEnvelope,
} from "../types";

/**
 * Result of destination validation
 */
export type ValidateDestinationResult =
  | { valid: true; destination: Destination }
  | { valid: false; reason: string };

/**
 * Result of HTTP destination invocation
 */
export type InvokeHttpResult =
  | { success: true; status: number }
  | { success: false; error: string };

/**
 * Validates that a destination exists and is enabled.
 * Returns validation result with destination or reason for failure.
 *
 * @param destinationName - Name of the destination to validate
 * @param routesConfig - Routes configuration containing destinations
 * @returns Validation result with destination data or failure reason
 */
export function validateDestination(
  destinationName: string,
  routesConfig?: DestinationsConfig
): ValidateDestinationResult {
  // Store-only destinations always pass validation but don't need routing
  if (!destinationName || destinationName === "store_only") {
    return { valid: false, reason: "store_only destination" };
  }

  if (!routesConfig) {
    return {
      valid: false,
      reason: `destination "${destinationName}" requested but no routes.json loaded`,
    };
  }

  const destination = routesConfig.destinations[destinationName];
  if (!destination) {
    return {
      valid: false,
      reason: `destination "${destinationName}" not found in routes.json`,
    };
  }

  if (destination.enabled === false) {
    return {
      valid: false,
      reason: `destination "${destinationName}" is disabled`,
    };
  }

  // Validate HTTP destination has required URL
  if ((destination.kind && destination.kind !== "http") || !destination.url) {
    return {
      valid: false,
      reason: `destination "${destinationName}" is not an HTTP destination or missing url`,
    };
  }

  return { valid: true, destination };
}

/**
 * Invokes an HTTP destination by making a POST request with the envelope.
 *
 * @param _destinationName - Name of the destination (for logging, currently unused)
 * @param destination - Validated destination configuration
 * @param envelope - Item envelope to send in request body
 * @returns Result of the HTTP invocation
 */
export async function invokeHttpProfile(
  _destinationName: string,
  destination: Destination,
  envelope: MessageEnvelope
): Promise<InvokeHttpResult> {
  if (!destination.url) {
    return { success: false, error: "Destination missing URL" };
  }

  const method = (destination.method || "POST").toUpperCase();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(destination.headers ?? {}),
  };

  try {
    const controller = new AbortController();
    const timeoutId = destination.timeoutMs
      ? setTimeout(() => controller.abort(), destination.timeoutMs)
      : null;

    const res = await fetch(destination.url, {
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
        error: `HTTP ${res.status} when sending to ${destination.url}`,
      };
    }

    return { success: true, status: res.status };
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return {
          success: false,
          error: `Request timeout after ${destination.timeoutMs}ms`,
        };
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: String(err) };
  }
}

/**
 * Routes an item to its configured destination.
 * Orchestrates validation and HTTP invocation with proper logging.
 *
 * @param destinationName - Name of the destination to use
 * @param envelope - Item envelope to route
 * @param routesConfig - Optional routes configuration
 */
export async function routeItem(
  destinationName: string,
  envelope: MessageEnvelope,
  routesConfig?: DestinationsConfig
): Promise<void> {
  const validation = validateDestination(destinationName, routesConfig);

  if (!validation.valid) {
    // Only log warnings for actual failures, not store_only
    if (validation.reason !== "store_only destination") {
      logger.warn("Destination validation failed", {
        destinationName,
        reason: validation.reason,
        itemId: envelope.id,
      });
    }
    return;
  }

  const result = await invokeHttpProfile(
    destinationName,
    validation.destination,
    envelope
  );

  if (!result.success) {
    logger.warn("Destination invocation failed", {
      destinationName,
      error: result.error,
      itemId: envelope.id,
    });
  }
}
