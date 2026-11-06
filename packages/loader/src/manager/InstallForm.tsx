// Upload einer Addon-ZIP; danach kurze Erfolgsmeldung und Neuladen
import { useState } from "preact/hooks";
import type { InstallResponse } from "../addons-client.js";
import { localize, t } from "../i18n.js";
import { errorText, isUnauthorized } from "./errors.js";

const RELOAD_DELAY_MS = 1500;

export interface InstallFormProps {
  locale: string;
  install: (file: Blob) => Promise<InstallResponse>;
  reload: () => void;
  onUnauthorized: () => void;
}

type Feedback = { kind: "success" | "error"; text: string } | null;

export function successText(result: InstallResponse, locale: string): string {
  const name = localize(result.addon.name, locale);
  const { version } = result.addon;
  const previous = result.previousVersion;
  if (previous === null) return t("manager.install.installed", locale, { name, version });
  if (previous === version) return t("manager.install.reinstalled", locale, { name, version });
  return t("manager.install.updated", locale, { previous, version });
}

export function InstallForm({ locale, install, reload, onUnauthorized }: InstallFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const submit = async (event: Event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback({ kind: "success", text: successText(await install(file), locale) });
      setTimeout(reload, RELOAD_DELAY_MS);
    } catch (err) {
      setBusy(false);
      if (isUnauthorized(err)) return onUnauthorized();
      setFeedback({ kind: "error", text: errorText(err, locale) });
    }
  };
  return (
    <form class="round-box mb-4" data-testid="addons-install" onSubmit={(e) => void submit(e)}>
      <strong class="d-block mb-3">{t("manager.install.title", locale)}</strong>
      <div class="d-flex flex-wrap gap-2">
        <input
          type="file"
          accept=".zip,application/zip"
          class="form-control flex-grow-1 w-auto"
          data-testid="addons-install-file"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        />
        <button type="submit" class="btn btn-primary" disabled={!file || busy}>
          {busy ? t("manager.install.uploading", locale) : t("manager.install.button", locale)}
        </button>
      </div>
      {feedback && (
        <div
          class={`small mt-2 ${feedback.kind === "success" ? "text-success" : "text-danger"}`}
          data-testid={`addons-install-${feedback.kind}`}
        >
          {feedback.text}
        </div>
      )}
    </form>
  );
}
