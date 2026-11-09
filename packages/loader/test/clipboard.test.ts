import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/manager/clipboard.js";

const execCommand = vi.fn<(command: string) => boolean>();

function setup(secure: boolean, clipboard?: { writeText: (text: string) => Promise<void> }) {
  vi.stubGlobal("isSecureContext", secure);
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  execCommand.mockReset();
});

describe("copyText", () => {
  it("nutzt navigator.clipboard in sicheren Kontexten", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setup(true, { writeText });
    await copyText("yaml");
    expect(writeText).toHaveBeenCalledWith("yaml");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("kopiert über http:// mit execCommand und räumt das Textfeld wieder weg", async () => {
    setup(false, undefined);
    let copied = "";
    execCommand.mockImplementation(() => {
      copied = document.querySelector("textarea")?.value ?? "";
      return true;
    });
    await copyText("enabled: …");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(copied).toBe("enabled: …");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("weicht aus, wenn navigator.clipboard ablehnt", async () => {
    setup(true, { writeText: () => Promise.reject(new Error("NotAllowedError")) });
    execCommand.mockReturnValue(true);
    await copyText("yaml");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("meldet, wenn auch execCommand ablehnt", async () => {
    setup(false, undefined);
    execCommand.mockReturnValue(false);
    await expect(copyText("yaml")).rejects.toThrow("Der Browser hat das Kopieren abgelehnt");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
