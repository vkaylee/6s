import { beforeEach, describe, expect, it } from "bun:test";
import { useRouteHistoryStore } from "../src/store/routeHistoryStore.ts";

describe("routeHistoryStore", () => {
  beforeEach(() => {
    useRouteHistoryStore.getState().reset("/");
  });

  it("starts with default route", () => {
    expect(useRouteHistoryStore.getState().stack).toEqual(["/"]);
    expect(useRouteHistoryStore.getState().canGoBack()).toBe(false);
  });

  it("pushes new routes", () => {
    useRouteHistoryStore.getState().push("/reports");
    expect(useRouteHistoryStore.getState().stack).toEqual(["/", "/reports"]);
    expect(useRouteHistoryStore.getState().canGoBack()).toBe(true);
  });

  it("skips consecutive duplicate routes", () => {
    useRouteHistoryStore.getState().push("/reports");
    useRouteHistoryStore.getState().push("/reports");
    expect(useRouteHistoryStore.getState().stack).toEqual(["/", "/reports"]);
  });

  it("pops back to the previous route", () => {
    useRouteHistoryStore.getState().push("/reports");
    useRouteHistoryStore.getState().push("/admin");
    const previous = useRouteHistoryStore.getState().pop();
    expect(previous).toBe("/reports");
    expect(useRouteHistoryStore.getState().stack).toEqual(["/", "/reports"]);
  });

  it("returns null when there is nowhere to go back", () => {
    expect(useRouteHistoryStore.getState().pop()).toBeNull();
    expect(useRouteHistoryStore.getState().stack).toEqual(["/"]);
  });

  it("replaces the current route", () => {
    useRouteHistoryStore.getState().push("/reports");
    useRouteHistoryStore.getState().replace("/admin");
    expect(useRouteHistoryStore.getState().stack).toEqual(["/", "/admin"]);
  });

  it("ignores invalid paths", () => {
    useRouteHistoryStore.getState().push("");
    // @ts-expect-error invalid type test
    useRouteHistoryStore.getState().push(null);
    // @ts-expect-error invalid type test
    useRouteHistoryStore.getState().replace(undefined);
    expect(useRouteHistoryStore.getState().stack).toEqual(["/"]);
  });

  it("caps the stack size", () => {
    for (let i = 0; i < 60; i++) {
      useRouteHistoryStore.getState().push(`/route-${i}`);
    }
    expect(useRouteHistoryStore.getState().stack.length).toBe(50);
    expect(useRouteHistoryStore.getState().stack[0]).toBe("/route-10");
  });
});
