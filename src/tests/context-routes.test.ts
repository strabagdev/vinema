import { describe, expect, it } from "vitest";
import {
  getContextDetailPath,
  getContextIdFromSearchParams,
  getContextListPath,
} from "@/features/context/context-routes";

describe("context routes", () => {
  it("builds static export-safe context routes", () => {
    expect(getContextListPath("AREA")).toBe("/contexts/areas");
    expect(getContextListPath("PROJECT")).toBe("/contexts/projects");
    expect(getContextListPath("PERSON")).toBe("/contexts/people");
    expect(getContextDetailPath("context with symbols/?")).toBe(
      "/contexts/detail?contextId=context%20with%20symbols%2F%3F",
    );
  });

  it("extracts contextId and rejects missing or empty params", () => {
    expect(
      getContextIdFromSearchParams(new URLSearchParams("contextId=area%201")),
    ).toBe("area 1");
    expect(getContextIdFromSearchParams(new URLSearchParams())).toBeNull();
    expect(getContextIdFromSearchParams(new URLSearchParams("contextId=%20"))).toBeNull();
  });
});
