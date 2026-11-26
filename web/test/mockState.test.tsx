import { describe, expect, it } from "bun:test";
import { type ReactNode, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { WithEffectSupport, WithHookMocks, WithMockState } from "./fixtures/mockState.tsx";

function Probe({ label }: { label: string }) {
  const [value] = useState(label);
  return <span>{value}</span>;
}

function ThrowingProbe(): ReactNode {
  const [value] = useState("initial");
  throw new Error(`boom:${value}`);
}

describe("React 19 SSR mock dispatcher isolation", () => {
  it("restores dispatcher after WithMockState without leaking to sibling or subsequent renders", () => {
    const html = renderToString(
      <>
        <WithMockState values={["mocked"]}>
          <Probe label="default-1" />
        </WithMockState>
        <Probe label="sibling-default" />
      </>,
    );
    expect(html).toContain("mocked");
    expect(html).toContain("sibling-default");

    const nextHtml = renderToString(<Probe label="clean-next" />);
    expect(nextHtml).toContain("clean-next");
    expect(nextHtml).not.toContain("mocked");
  });

  it("does not leak mocked useState when child render throws", () => {
    expect(() =>
      renderToString(
        <WithMockState values={["leaked-on-throw"]}>
          <ThrowingProbe />
        </WithMockState>,
      ),
    ).toThrow("boom:leaked-on-throw");

    const nextHtml = renderToString(<Probe label="after-throw" />);
    expect(nextHtml).toContain("after-throw");
    expect(nextHtml).not.toContain("leaked-on-throw");
  });

  it("does not leak WithEffectSupport or WithHookMocks when child render throws", () => {
    let effectCalls = 0;
    function ThrowingEffect(): ReactNode {
      useEffect(() => {
        effectCalls += 1;
      }, []);
      throw new Error("effect-boom");
    }

    expect(() =>
      renderToString(
        <WithEffectSupport>
          <ThrowingEffect />
        </WithEffectSupport>,
      ),
    ).toThrow("effect-boom");
    expect(effectCalls).toBe(1);

    function CleanEffect() {
      useEffect(() => {
        effectCalls += 1;
      }, []);
      return <span>ok</span>;
    }

    expect(renderToString(<CleanEffect />)).toContain("ok");
    expect(effectCalls).toBe(1);

    expect(() =>
      renderToString(
        <WithHookMocks initialStates={["leaked-hook"]}>
          <ThrowingProbe />
        </WithHookMocks>,
      ),
    ).toThrow("boom:leaked-hook");

    const nextHtml = renderToString(<Probe label="after-hook-throw" />);
    expect(nextHtml).toContain("after-hook-throw");
    expect(nextHtml).not.toContain("leaked-hook");
  });
});
