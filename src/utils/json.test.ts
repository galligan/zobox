import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { parseJson, parseJsonAs, safeParseJsonAs } from "./json";

describe("parseJson", () => {
  it("parses valid JSON string", () => {
    const result = parseJson('{"name":"Alice","age":30}');
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("parses JSON arrays", () => {
    const result = parseJson('[1, 2, 3, "four"]');
    expect(result).toEqual([1, 2, 3, "four"]);
  });

  it("parses JSON primitives", () => {
    expect(parseJson('"hello"')).toBe("hello");
    expect(parseJson("42")).toBe(42);
    expect(parseJson("true")).toBe(true);
    expect(parseJson("null")).toBe(null);
  });

  it("throws SyntaxError for invalid JSON", () => {
    expect(() => parseJson("{invalid json}")).toThrow(SyntaxError);
    expect(() => parseJson('{"unclosed":')).toThrow(SyntaxError);
    expect(() => parseJson("undefined")).toThrow(SyntaxError);
  });

  it("handles complex nested structures", () => {
    const json = JSON.stringify({
      users: [
        { id: 1, name: "Alice", meta: { active: true } },
        { id: 2, name: "Bob", meta: { active: false } },
      ],
      timestamp: "2025-01-01T00:00:00Z",
    });
    const result = parseJson(json);
    expect(result).toMatchObject({
      users: expect.any(Array),
      timestamp: expect.any(String),
    });
  });
});

describe("parseJsonAs", () => {
  const UserSchema = z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email().optional(),
  });

  it("parses and validates valid JSON", () => {
    const result = parseJsonAs(
      '{"name":"Alice","age":30,"email":"alice@example.com"}',
      UserSchema
    );
    expect(result).toEqual({
      name: "Alice",
      age: 30,
      email: "alice@example.com",
    });
  });

  it("parses and validates JSON with optional fields omitted", () => {
    const result = parseJsonAs('{"name":"Bob","age":25}', UserSchema);
    expect(result).toEqual({ name: "Bob", age: 25 });
  });

  it("throws SyntaxError for invalid JSON", () => {
    expect(() => parseJsonAs("{invalid}", UserSchema)).toThrow(SyntaxError);
  });

  it("throws ZodError for schema validation failure", () => {
    expect(() =>
      parseJsonAs('{"name":"Alice","age":"thirty"}', UserSchema)
    ).toThrow(z.ZodError);
    expect(() => parseJsonAs('{"name":"Alice"}', UserSchema)).toThrow(
      z.ZodError
    );
    expect(() =>
      parseJsonAs(
        '{"name":"Alice","age":30,"email":"not-an-email"}',
        UserSchema
      )
    ).toThrow(z.ZodError);
  });

  it("works with array schemas", () => {
    const ArraySchema = z.array(z.number());
    const result = parseJsonAs("[1, 2, 3, 4, 5]", ArraySchema);
    expect(result).toEqual([1, 2, 3, 4, 5]);

    expect(() => parseJsonAs('[1, 2, "three"]', ArraySchema)).toThrow(
      z.ZodError
    );
  });

  it("works with union schemas", () => {
    const UnionSchema = z.union([
      z.object({ type: z.literal("user"), name: z.string() }),
      z.object({ type: z.literal("admin"), role: z.string() }),
    ]);

    const userResult = parseJsonAs(
      '{"type":"user","name":"Alice"}',
      UnionSchema
    );
    expect(userResult).toEqual({ type: "user", name: "Alice" });

    const adminResult = parseJsonAs(
      '{"type":"admin","role":"superuser"}',
      UnionSchema
    );
    expect(adminResult).toEqual({ type: "admin", role: "superuser" });
  });

  it("preserves type safety", () => {
    const result = parseJsonAs('{"name":"Alice","age":30}', UserSchema);
    // TypeScript should infer the correct type
    const name: string = result.name;
    const age: number = result.age;
    expect(name).toBe("Alice");
    expect(age).toBe(30);
  });
});

describe("safeParseJsonAs", () => {
  const UserSchema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it("returns success for valid JSON and schema", () => {
    const result = safeParseJsonAs('{"name":"Alice","age":30}', UserSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Alice", age: 30 });
    }
  });

  it("returns failure for invalid JSON syntax", () => {
    const result = safeParseJsonAs("{invalid json}", UserSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError);
      expect(result.error.issues[0].message).toContain("Invalid JSON");
    }
  });

  it("returns failure for schema validation errors", () => {
    const result = safeParseJsonAs(
      '{"name":"Alice","age":"thirty"}',
      UserSchema
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError);
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].path).toEqual(["age"]);
    }
  });

  it("returns failure for missing required fields", () => {
    const result = safeParseJsonAs('{"name":"Alice"}', UserSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["age"]);
    }
  });

  it("handles complex validation errors", () => {
    const ComplexSchema = z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      age: z.number().min(0).max(150),
    });

    const result = safeParseJsonAs(
      '{"id":"not-a-uuid","email":"invalid-email","age":-5}',
      ComplexSchema
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("allows pattern matching on result", () => {
    const result = safeParseJsonAs('{"name":"Alice","age":30}', UserSchema);

    const value = result.success ? result.data.name : "Unknown";
    expect(value).toBe("Alice");

    const errorResult = safeParseJsonAs('{"name":"Alice"}', UserSchema);
    const errorMessage = errorResult.success
      ? null
      : errorResult.error.issues[0].message;
    expect(errorMessage).toBeTruthy();
  });
});

describe("Bun JSON optimization", () => {
  it("handles large JSON objects efficiently", () => {
    // Create a reasonably large JSON object
    const largeObject = {
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        data: { value: i * 2, active: i % 2 === 0 },
      })),
    };
    const json = JSON.stringify(largeObject);

    // This should complete quickly with Bun's optimization
    const start = performance.now();
    const result = parseJson(json);
    const duration = performance.now() - start;

    expect(result).toMatchObject({ items: expect.any(Array) });
    // Should be very fast (under 50ms for 1000 items)
    expect(duration).toBeLessThan(50);
  });

  it("handles deeply nested structures", () => {
    const deepObject = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                value: "deep",
                items: [1, 2, 3],
              },
            },
          },
        },
      },
    };
    const json = JSON.stringify(deepObject);
    const result = parseJson(json);

    expect(result).toMatchObject({
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                value: "deep",
                items: [1, 2, 3],
              },
            },
          },
        },
      },
    });
  });
});
