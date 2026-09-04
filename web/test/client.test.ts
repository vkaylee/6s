import { describe, expect, it } from "bun:test";
import { ApiError } from "../src/api/client.ts";

describe("apiClient ApiError", () => {
  it("constructs with status and code", () => {
    const err = new ApiError(409, "Phiên bản đã thay đổi", "CONFLICT", { current_version: 2 });
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Phiên bản đã thay đổi");
    expect(err.details).toEqual({ current_version: 2 });
  });
});
