import { describe, expect, it } from "bun:test";
import { ApiError } from "../src/api/client.ts";
import { classifyAuthenticatedImageError } from "../src/hooks/useAuthenticatedImageUrl.ts";

describe("native authenticated image URLs", () => {
  it("keeps protected media as same-origin URLs for cookie transport", () => {
    const imageUrl = "/api/issues/1/media/before/test.jpg";

    expect(new URL(imageUrl, "https://6s.test").origin).toBe("https://6s.test");
  });
});

describe("classifyAuthenticatedImageError", () => {
  it("classifies 401 as UNAUTHORIZED", () => {
    expect(classifyAuthenticatedImageError(new ApiError(401, "unauthorized"))).toBe("UNAUTHORIZED");
  });

  it("classifies 403 as FORBIDDEN", () => {
    expect(classifyAuthenticatedImageError(new ApiError(403, "forbidden"))).toBe("FORBIDDEN");
  });

  it("classifies 404 as NOT_FOUND", () => {
    expect(classifyAuthenticatedImageError(new ApiError(404, "not found"))).toBe("NOT_FOUND");
  });

  it("classifies network TypeError as NETWORK_ERROR", () => {
    expect(classifyAuthenticatedImageError(new TypeError("Failed to fetch"))).toBe("NETWORK_ERROR");
  });

  it("classifies unexpected errors as UNKNOWN", () => {
    expect(classifyAuthenticatedImageError(new Error("random failure"))).toBe("UNKNOWN");
    expect(classifyAuthenticatedImageError("string error")).toBe("UNKNOWN");
  });
});
