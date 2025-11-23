/**
 * Request validation middleware for Hono.
 * Provides type-safe validation for JSON and multipart requests.
 */

import type { Context, Next } from "hono";
import type { z } from "zod";
import { parseJson, safeParseJsonAs } from "./utils/json.js";

/**
 * Context variables set by validation middleware.
 * Used to retrieve validated data in handlers.
 */
export type ValidationContextVariables = {
  validatedBody: unknown;
  validatedMultipart: unknown;
};

/**
 * Type helper to extract validated body from context.
 * Usage: const data = getValidatedBody<MyType>(c);
 */
export function getValidatedBody<T>(c: Context): T {
  const data = c.get("validatedBody");
  if (data === undefined) {
    throw new Error(
      "No validated body found. Did you forget to use validateJson middleware?"
    );
  }
  return data as T;
}

/**
 * Type helper to extract validated multipart data from context.
 * Usage: const data = getValidatedMultipart<MyType>(c);
 */
export function getValidatedMultipart<T>(c: Context): T {
  const data = c.get("validatedMultipart");
  if (data === undefined) {
    throw new Error(
      "No validated multipart data found. Did you forget to use validateMultipart middleware?"
    );
  }
  return data as T;
}

/**
 * Middleware to validate JSON request bodies against a Zod schema.
 *
 * On success, sets `validatedBody` in context for retrieval via getValidatedBody().
 * On failure, returns 400 with structured error details including field paths.
 *
 * @example
 * ```typescript
 * app.post('/items',
 *   validateJson(NewItemInputSchema),
 *   async (c) => {
 *     const data = getValidatedBody<NewItemInput>(c);
 *     // data is fully typed and validated
 *   }
 * );
 * ```
 */
export function validateJson<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (err) {
      return c.json(
        {
          error: "Invalid JSON",
          details: err instanceof Error ? err.message : "Failed to parse JSON",
        },
        400
      );
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      return c.json(
        {
          error: "Validation failed",
          details: result.error.format(),
        },
        400
      );
    }

    c.set("validatedBody", result.data);
    await next();
  };
}

/**
 * Schema for multipart form data validation.
 * Validates that required files and fields are present.
 */
export type MultipartValidationSchema<T> = {
  /**
   * Custom parser function that receives FormData and returns typed data.
   * Should throw descriptive errors on validation failure.
   */
  parse: (formData: FormData) => T | Promise<T>;
};

/**
 * Middleware to validate multipart form data requests.
 *
 * On success, sets `validatedMultipart` in context for retrieval via getValidatedMultipart().
 * On failure, returns 400 with structured error details.
 *
 * @example
 * ```typescript
 * const multipartSchema: MultipartValidationSchema<MyData> = {
 *   parse: (formData) => {
 *     const file = formData.get('file');
 *     if (!file || !(file instanceof File)) {
 *       throw new Error('Missing required file field: file');
 *     }
 *     const type = formData.get('type');
 *     if (!type || typeof type !== 'string') {
 *       throw new Error('Missing required field: type');
 *     }
 *     return { file, type };
 *   }
 * };
 *
 * app.post('/upload',
 *   validateMultipart(multipartSchema),
 *   async (c) => {
 *     const data = getValidatedMultipart<MyData>(c);
 *     // data is fully typed and validated
 *   }
 * );
 * ```
 */
export function validateMultipart<T>(schema: MultipartValidationSchema<T>) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch (err) {
      return c.json(
        {
          error: "Invalid multipart data",
          details:
            err instanceof Error ? err.message : "Failed to parse form data",
        },
        400
      );
    }

    try {
      const result = await schema.parse(formData);
      c.set("validatedMultipart", result);
      await next();
    } catch (err) {
      return c.json(
        {
          error: "Validation failed",
          details:
            err instanceof Error ? err.message : "Unknown validation error",
        },
        400
      );
    }
  };
}

/**
 * Helper utilities for multipart validation.
 * Provides functions for extracting and validating files and fields from FormData.
 */

/**
 * Extract a required file from FormData.
 * @throws Error with descriptive message if file is missing or invalid
 */
export function requireFile(formData: FormData, fieldName: string): File {
  const value = formData.get(fieldName);
  if (!value) {
    throw new Error(`Missing required file field: ${fieldName}`);
  }
  if (!(value instanceof File)) {
    throw new Error(`Field '${fieldName}' must be a file, got ${typeof value}`);
  }
  return value;
}

/**
 * Extract an optional file from FormData.
 * Returns undefined if not present or not a file.
 */
export function optionalFile(
  formData: FormData,
  fieldName: string
): File | undefined {
  const value = formData.get(fieldName);
  if (!value) {
    return;
  }
  if (!(value instanceof File)) {
    throw new Error(`Field '${fieldName}' must be a file, got ${typeof value}`);
  }
  return value;
}

/**
 * Extract a required string field from FormData.
 * @throws Error with descriptive message if field is missing or not a string
 */
export function requireString(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);
  if (!value) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  if (typeof value !== "string") {
    throw new Error(
      `Field '${fieldName}' must be a string, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Extract an optional string field from FormData.
 * Returns undefined if not present.
 */
export function optionalString(
  formData: FormData,
  fieldName: string
): string | undefined {
  const value = formData.get(fieldName);
  if (!value) {
    return;
  }
  if (typeof value !== "string") {
    throw new Error(
      `Field '${fieldName}' must be a string, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Extract a JSON field from FormData and parse it.
 * @throws Error if field is not valid JSON or fails schema validation
 */
export function requireJson<T>(
  formData: FormData,
  fieldName: string,
  schema?: z.ZodSchema<T>
): T {
  const raw = requireString(formData, fieldName);

  if (schema) {
    const result = safeParseJsonAs(raw, schema);
    if (!result.success) {
      throw new Error(
        `Field '${fieldName}' failed validation: ${JSON.stringify(result.error.format())}`
      );
    }
    return result.data;
  }

  // Use Bun's optimized JSON.parse for unvalidated parsing
  try {
    return parseJson(raw) as T;
  } catch (err) {
    throw new Error(
      `Field '${fieldName}' contains invalid JSON: ${err instanceof Error ? err.message : "parse error"}`
    );
  }
}

/**
 * Extract an optional JSON field from FormData and parse it.
 * Returns undefined if not present.
 */
export function optionalJson<T>(
  formData: FormData,
  fieldName: string,
  schema?: z.ZodSchema<T>
): T | undefined {
  const raw = optionalString(formData, fieldName);
  if (!raw) {
    return;
  }

  if (schema) {
    const result = safeParseJsonAs(raw, schema);
    if (!result.success) {
      throw new Error(
        `Field '${fieldName}' failed validation: ${JSON.stringify(result.error.format())}`
      );
    }
    return result.data;
  }

  // Use Bun's optimized JSON.parse for unvalidated parsing
  try {
    return parseJson(raw) as T;
  } catch (err) {
    throw new Error(
      `Field '${fieldName}' contains invalid JSON: ${err instanceof Error ? err.message : "parse error"}`
    );
  }
}
