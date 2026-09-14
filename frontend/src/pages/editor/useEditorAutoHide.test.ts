import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorAutoHide } from "./useEditorAutoHide";

const storageKey = "excalidash:editor:d1:autoHideEnabled";

describe("useEditorAutoHide", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("leaves the header showing until auto-hide is asked for", () => {
    const { result } = renderHook(() => useEditorAutoHide("d1"));

    expect(result.current.autoHideEnabled).toBe(false);
  });

  it("honours a stored preference to auto-hide", () => {
    window.localStorage.setItem(storageKey, "1");

    const { result } = renderHook(() => useEditorAutoHide("d1"));

    expect(result.current.autoHideEnabled).toBe(true);
  });

  it("remembers the choice once it is made", () => {
    const { result } = renderHook(() => useEditorAutoHide("d1"));

    act(() => result.current.setAutoHideEnabled(true));

    expect(result.current.autoHideEnabled).toBe(true);
    expect(window.localStorage.getItem(storageKey)).toBe("1");
  });
});
