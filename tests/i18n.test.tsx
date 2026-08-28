import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSelector } from "../src/components/LanguageSelector";
import i18n, { availableLanguages, LANGUAGE_STORAGE_KEY } from "../src/i18n";

describe("internationalization", () => {
  const values = new Map<string, string>();

  beforeEach(async () => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    await act(() => i18n.changeLanguage("en"));
  });

  afterEach(async () => {
    await act(() => i18n.changeLanguage("en"));
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it("discovers bundled locale files without a hand-maintained registry", () => {
    expect(availableLanguages).toEqual([
      { code: "en", name: "English", direction: "ltr" },
      { code: "sv", name: "Svenska", direction: "ltr" },
    ]);
  });

  it("switches language, persists the choice, and updates the document language", async () => {
    render(<LanguageSelector />);

    fireEvent.click(screen.getByRole("button", { name: "Language: English" }));
    fireEvent.click(screen.getByRole("button", { name: "Svenska" }));

    expect(await screen.findByRole("button", { name: "Språk: Svenska" })).toBeInTheDocument();
    expect(i18n.resolvedLanguage).toBe("sv");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("sv");
    expect(document.documentElement).toHaveAttribute("lang", "sv");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });
});
