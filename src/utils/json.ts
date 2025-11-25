import { z } from "zod";

/**
 * Parse JSON text using Bun's optimized JSON.parse.
 * Bun automatically optimizes JSON.parse for better performance.
 *
 * @param text - The JSON string to parse
 * @returns The parsed unknown value
 * @throws {SyntaxError} If the JSON is malformed
 */
export function parseJson(text: string): unknown {
  return JSON.parse(text); // Bun optimizes this automatically
}

/**
 * Parse JSON text and validate it against a Zod schema.
 * This combines Bun's fast JSON parsing with runtime type validation.
 *
 * @param text - The JSON string to parse
 * @param schema - The Zod schema to validate against
 * @returns The parsed and validated value
 * @throws {SyntaxError} If the JSON is malformed
 * @throws {z.ZodError} If validation fails
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { parseJsonAs } from "./json";
 *
 * const UserSchema = z.object({ name: z.string(), age: z.number() });
 * const user = parseJsonAs('{"name":"Alice","age":30}', UserSchema);
 * ```
 */
export function parseJsonAs<T>(text: string, schema: z.ZodSchema<T>): T {
  const raw = parseJson(text);
  return schema.parse(raw);
}

/**
 * Safely parse JSON text and validate it against a Zod schema.
 * Returns a result object instead of throwing.
 *
 * @param text - The JSON string to parse
 * @param schema - The Zod schema to validate against
 * @returns Success with data or failure with error
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { safeParseJsonAs } from "./json";
 *
 * const UserSchema = z.object({ name: z.string(), age: z.number() });
 * const result = safeParseJsonAs('{"name":"Alice","age":30}', UserSchema);
 *
 * if (result.success) {
 *   console.log(result.data.name);
 * } else {
 *   console.error(result.error.errors);
 * }
 * ```
 */
export function safeParseJsonAs<T>(
  text: string,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: z.ZodError } {
  try {
    const raw = parseJson(text);
    const result = schema.safeParse(raw);
    return result;
  } catch (err) {
    // Handle JSON syntax errors by wrapping them in a ZodError-compatible format
    if (err instanceof SyntaxError) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: "custom",
            path: [],
            message: `Invalid JSON: ${err.message}`,
          },
        ]),
      };
    }
    // Re-throw unexpected errors
    throw err;
  }
}
