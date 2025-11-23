/**
 * Tests for request validation middleware.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  getValidatedBody,
  getValidatedMultipart,
  type MultipartValidationSchema,
  optionalFile,
  optionalJson,
  optionalString,
  requireFile,
  requireJson,
  requireString,
  validateJson,
  validateMultipart,
} from "./middleware";

describe("validateJson middleware", () => {
  const TestSchema = z.object({
    name: z.string().min(1, "name must not be empty"),
    age: z.number().int().positive("age must be positive"),
    email: z.string().email("invalid email format").optional(),
  });

  type TestData = z.infer<typeof TestSchema>;

  it("should pass valid requests through", async () => {
    const app = new Hono();
    app.post("/test", validateJson(TestSchema), (c) => {
      const data = getValidatedBody<TestData>(c);
      return c.json({ success: true, data });
    });

    const validData = { name: "Alice", age: 30, email: "alice@example.com" };
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validData),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: validData });
  });

  it("should accept valid data without optional fields", async () => {
    const app = new Hono();
    app.post("/test", validateJson(TestSchema), (c) => {
      const data = getValidatedBody<TestData>(c);
      return c.json({ success: true, data });
    });

    const validData = { name: "Bob", age: 25 };
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validData),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: validData });
  });

  it("should return 400 for invalid JSON syntax", async () => {
    const app = new Hono();
    app.post("/test", validateJson(TestSchema), (c) =>
      c.json({ success: true })
    );

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json",
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error", "Invalid JSON");
    expect(json).toHaveProperty("details");
  });

  it("should return 400 with structured errors for validation failures", async () => {
    const app = new Hono();
    app.post("/test", validateJson(TestSchema), (c) =>
      c.json({ success: true })
    );

    const invalidData = { name: "", age: -5, email: "not-an-email" };
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidData),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error", "Validation failed");
    expect(json).toHaveProperty("details");

    // Verify structured error format includes field paths
    const details = json.details;
    expect(details).toHaveProperty("name");
    expect(details).toHaveProperty("age");
    expect(details).toHaveProperty("email");
  });

  it("should include field paths in schema errors", async () => {
    const NestedSchema = z.object({
      user: z.object({
        profile: z.object({
          username: z.string().min(3, "username too short"),
        }),
      }),
    });

    const app = new Hono();
    app.post("/test", validateJson(NestedSchema), (c) =>
      c.json({ success: true })
    );

    const invalidData = { user: { profile: { username: "ab" } } };
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidData),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty("user");
    expect(json.details.user).toHaveProperty("profile");
  });

  it("should return 400 for missing required fields", async () => {
    const app = new Hono();
    app.post("/test", validateJson(TestSchema), (c) =>
      c.json({ success: true })
    );

    const incompleteData = { name: "Charlie" }; // missing 'age'
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(incompleteData),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error", "Validation failed");
    expect(json.details).toHaveProperty("age");
  });

  it("should return 400 for wrong field types", async () => {
    const app = new Hono();
    app.post("/test", validateJson(TestSchema), (c) =>
      c.json({ success: true })
    );

    const wrongTypeData = { name: "Dave", age: "not a number" };
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wrongTypeData),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error", "Validation failed");
    expect(json.details).toHaveProperty("age");
  });

  it("should make validated data accessible in handlers", async () => {
    const app = new Hono();
    let capturedData: TestData | null = null;

    app.post("/test", validateJson(TestSchema), (c) => {
      capturedData = getValidatedBody<TestData>(c);
      return c.json({ success: true });
    });

    const validData = { name: "Eve", age: 28 };
    await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validData),
    });

    expect(capturedData).toEqual(validData);
  });
});

describe("getValidatedBody helper", () => {
  it("should throw error when called without middleware", () => {
    const app = new Hono();
    app.post("/test", (c) => {
      expect(() => getValidatedBody(c)).toThrow(
        "No validated body found. Did you forget to use validateJson middleware?"
      );
      return c.json({ success: true });
    });

    app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });
});

describe("validateMultipart middleware", () => {
  type TestMultipartData = {
    file: File;
    name: string;
    description?: string;
  };

  const testSchema: MultipartValidationSchema<TestMultipartData> = {
    parse: (formData) => {
      const file = requireFile(formData, "file");
      const name = requireString(formData, "name");
      const description = optionalString(formData, "description");
      return { file, name, description };
    },
  };

  it("should pass valid multipart requests through", async () => {
    const app = new Hono();
    app.post("/upload", validateMultipart(testSchema), (c) => {
      const data = getValidatedMultipart<TestMultipartData>(c);
      return c.json({
        success: true,
        filename: data.file.name,
        name: data.name,
      });
    });

    const formData = new FormData();
    formData.append("file", new File(["content"], "test.txt"));
    formData.append("name", "Test Upload");

    const res = await app.request("/upload", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      filename: "test.txt",
      name: "Test Upload",
    });
  });

  it("should accept valid data with optional fields", async () => {
    const app = new Hono();
    app.post("/upload", validateMultipart(testSchema), (c) => {
      const data = getValidatedMultipart<TestMultipartData>(c);
      return c.json({
        success: true,
        description: data.description,
      });
    });

    const formData = new FormData();
    formData.append("file", new File(["content"], "test.txt"));
    formData.append("name", "Test Upload");
    formData.append("description", "Optional description");

    const res = await app.request("/upload", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.description).toBe("Optional description");
  });

  it("should return 400 for missing required file", async () => {
    const app = new Hono();
    app.post("/upload", validateMultipart(testSchema), (c) =>
      c.json({ success: true })
    );

    const formData = new FormData();
    formData.append("name", "Test Upload");
    // missing 'file'

    const res = await app.request("/upload", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error", "Validation failed");
    expect(json.details).toContain("Missing required file field: file");
  });

  it("should return 400 for missing required string field", async () => {
    const app = new Hono();
    app.post("/upload", validateMultipart(testSchema), (c) =>
      c.json({ success: true })
    );

    const formData = new FormData();
    formData.append("file", new File(["content"], "test.txt"));
    // missing 'name'

    const res = await app.request("/upload", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error", "Validation failed");
    expect(json.details).toContain("Missing required field: name");
  });

  it("should return 400 when file field contains non-file data", async () => {
    const schemaExpectingFile: MultipartValidationSchema<{ file: File }> = {
      parse: (data) => ({
        file: requireFile(data, "file"),
      }),
    };

    const app = new Hono();
    app.post("/upload", validateMultipart(schemaExpectingFile), (c) =>
      c.json({ success: true })
    );

    const formData = new FormData();
    formData.append("file", "not a file, just a string");

    const res = await app.request("/upload", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toContain("Field 'file' must be a file");
  });

  it("should make validated data accessible in handlers", async () => {
    const app = new Hono();
    let capturedData: TestMultipartData | null = null;

    app.post("/upload", validateMultipart(testSchema), (c) => {
      capturedData = getValidatedMultipart<TestMultipartData>(c);
      return c.json({ success: true });
    });

    const formData = new FormData();
    formData.append("file", new File(["content"], "test.txt"));
    formData.append("name", "Test Upload");

    await app.request("/upload", {
      method: "POST",
      body: formData,
    });

    expect(capturedData).not.toBeNull();
    // Assert non-null for type checking (double assertion via unknown)
    const data = capturedData as unknown as TestMultipartData;
    expect(data.name).toBe("Test Upload");
    expect(data.file.name).toBe("test.txt");
  });
});

describe("getValidatedMultipart helper", () => {
  it("should throw error when called without middleware", () => {
    const app = new Hono();
    app.post("/test", (c) => {
      expect(() => getValidatedMultipart(c)).toThrow(
        "No validated multipart data found. Did you forget to use validateMultipart middleware?"
      );
      return c.json({ success: true });
    });

    app.request("/test", {
      method: "POST",
      body: new FormData(),
    });
  });
});

describe("Multipart validation helpers", () => {
  describe("requireFile", () => {
    it("should extract a file successfully", () => {
      const formData = new FormData();
      const file = new File(["content"], "test.txt");
      formData.append("upload", file);

      const result = requireFile(formData, "upload");
      expect(result).toEqual(file);
    });

    it("should throw when field is missing", () => {
      const formData = new FormData();
      expect(() => requireFile(formData, "upload")).toThrow(
        "Missing required file field: upload"
      );
    });

    it("should throw when field is not a file", () => {
      const formData = new FormData();
      formData.append("upload", "string value");
      expect(() => requireFile(formData, "upload")).toThrow(
        "Field 'upload' must be a file"
      );
    });
  });

  describe("optionalFile", () => {
    it("should extract a file when present", () => {
      const formData = new FormData();
      const file = new File(["content"], "test.txt");
      formData.append("upload", file);

      const result = optionalFile(formData, "upload");
      expect(result).toEqual(file);
    });

    it("should return undefined when field is missing", () => {
      const formData = new FormData();
      const result = optionalFile(formData, "upload");
      expect(result).toBeUndefined();
    });

    it("should throw when field is not a file", () => {
      const formData = new FormData();
      formData.append("upload", "string value");
      expect(() => optionalFile(formData, "upload")).toThrow(
        "Field 'upload' must be a file"
      );
    });
  });

  describe("requireString", () => {
    it("should extract a string successfully", () => {
      const formData = new FormData();
      formData.append("name", "test value");

      const result = requireString(formData, "name");
      expect(result).toBe("test value");
    });

    it("should throw when field is missing", () => {
      const formData = new FormData();
      expect(() => requireString(formData, "name")).toThrow(
        "Missing required field: name"
      );
    });

    it("should throw when field is not a string (is a file)", () => {
      const formData = new FormData();
      formData.append("name", new File(["content"], "test.txt"));
      expect(() => requireString(formData, "name")).toThrow(
        "Field 'name' must be a string"
      );
    });
  });

  describe("optionalString", () => {
    it("should extract a string when present", () => {
      const formData = new FormData();
      formData.append("name", "test value");

      const result = optionalString(formData, "name");
      expect(result).toBe("test value");
    });

    it("should return undefined when field is missing", () => {
      const formData = new FormData();
      const result = optionalString(formData, "name");
      expect(result).toBeUndefined();
    });
  });

  describe("requireJson", () => {
    it("should parse and validate JSON successfully", () => {
      const schema = z.object({ id: z.number(), name: z.string() });
      const formData = new FormData();
      formData.append("meta", JSON.stringify({ id: 123, name: "test" }));

      const result = requireJson(formData, "meta", schema);
      expect(result).toEqual({ id: 123, name: "test" });
    });

    it("should work without schema validation", () => {
      const formData = new FormData();
      formData.append("data", JSON.stringify({ foo: "bar" }));

      const result = requireJson(formData, "data");
      expect(result).toEqual({ foo: "bar" });
    });

    it("should throw on invalid JSON", () => {
      const formData = new FormData();
      formData.append("data", "{invalid json}");

      expect(() => requireJson(formData, "data")).toThrow(
        "Field 'data' contains invalid JSON"
      );
    });

    it("should throw on schema validation failure", () => {
      const schema = z.object({ id: z.number() });
      const formData = new FormData();
      formData.append("data", JSON.stringify({ id: "not a number" }));

      expect(() => requireJson(formData, "data", schema)).toThrow(
        "Field 'data' failed validation"
      );
    });

    it("should throw when field is missing", () => {
      const formData = new FormData();
      expect(() => requireJson(formData, "data")).toThrow(
        "Missing required field: data"
      );
    });
  });

  describe("optionalJson", () => {
    it("should parse and validate JSON when present", () => {
      const schema = z.object({ id: z.number() });
      const formData = new FormData();
      formData.append("meta", JSON.stringify({ id: 123 }));

      const result = optionalJson(formData, "meta", schema);
      expect(result).toEqual({ id: 123 });
    });

    it("should return undefined when field is missing", () => {
      const formData = new FormData();
      const result = optionalJson(formData, "meta");
      expect(result).toBeUndefined();
    });

    it("should throw on invalid JSON", () => {
      const formData = new FormData();
      formData.append("meta", "{invalid}");

      expect(() => optionalJson(formData, "meta")).toThrow(
        "Field 'meta' contains invalid JSON"
      );
    });

    it("should throw on schema validation failure", () => {
      const schema = z.object({ id: z.number() });
      const formData = new FormData();
      formData.append("meta", JSON.stringify({ id: "wrong type" }));

      expect(() => optionalJson(formData, "meta", schema)).toThrow(
        "Field 'meta' failed validation"
      );
    });
  });
});
