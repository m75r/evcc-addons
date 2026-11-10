// Upload einer Addon-ZIP; danach kurze Erfolgsmeldung und Neuladen
import { useState } from "preact/hooks";
import type { InstallResponse } from "../addons-client.js";
import { localize, t } from "../i18n.js";
import { errorText, isUnauthorized } from "./errors.js";

/** Wartezeit bis zum Neuladen nach einer Installation (Upload und Katalog) */
export const RELOAD_DELAY_MS = 1500;

export interface InstallFormProps {
  locale: string;
  install: (file: Blob) => Promise<InstallResponse>;
  reload: () => void;
  onUnauthorized: () => void;
  /** Bei jedem Wechsel von busy (Upload läuft bzw. ist beendet) */
  onBusyChange?: (busy: boolean) => void;
  /** Sperrt Dateiauswahl und Button zusätzlich, z. B. während einer Katalog-Installation */
  disabled?: boolean;
}

export interface InstallFeedback {
  kind: "success" | "error";
  text: string;
}

type Feedback = InstallFeedback | null;

export function successText(result: InstallResponse, locale: string): string {
  const name = localize(result.addon.name, locale);
  const { version } = result.addon;
  const previous = result.previousVersion;
  if (previous === null) return t("manager.install.installed", locale, { name, version });
  if (previous === version) return t("manager.install.reinstalled", locale, { name, version });
  return t("manager.install.updated", locale, { previous, version });
}

/** Upload mit Meldung; nach Erfolg bleibt busy gesetzt, bis die Seite neu lädt */
function useUpload(props: InstallFormProps) {
  const { locale, install, reload, onUnauthorized, onBusyChange } = props;
  const [busy, setBusyState] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const setBusy = (value: boolean) => {
    setBusyState(value);
    onBusyChange?.(value);
  };
  const upload = async (file: File) => {
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
  return { busy, feedback, upload };
}

export function InstallForm(props: InstallFormProps) {
  const { locale, disabled = false } = props;
  const [file, setFile] = useState<File | null>(null);
  const { busy, feedback, upload } = useUpload(props);
  const submit = (event: Event) => {
    event.preventDefault();
    if (file && !disabled) void upload(file);
  };
  return (
    <form class="round-box mb-4" data-testid="addons-install" onSubmit={submit}>
      <strong class="d-block mb-3">{t("manager.install.title", locale)}</strong>
      <div class="d-flex flex-wrap gap-2">
        <input
          type="file"
          accept=".zip,application/zip"
          class="form-control flex-grow-1 w-auto"
          data-testid="addons-install-file"
          disabled={busy || disabled}
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        />
        <button type="submit" class="btn btn-primary" disabled={!file || busy || disabled}>
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
