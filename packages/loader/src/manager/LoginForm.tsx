// Anmeldung mit dem evcc-Admin-Passwort; danach Neuladen, damit auch evcc den Login übernimmt
import { useState } from "preact/hooks";
import { ApiError } from "../addons-client.js";
import { t } from "../i18n.js";

export interface LoginFormProps {
  locale: string;
  login: (password: string) => Promise<void>;
  reload: () => void;
}

export function LoginForm({ locale, login, reload }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      reload();
    } catch (err) {
      setBusy(false);
      setError(loginErrorText(err, locale));
    }
  };
  return (
    <form class="round-box mb-4" data-testid="addons-login" onSubmit={(e) => void submit(e)}>
      <strong class="d-block mb-3">{t("login.title", locale)}</strong>
      <div class="d-flex flex-wrap gap-2">
        <input
          type="password"
          class="form-control flex-grow-1 w-auto"
          autocomplete="current-password"
          aria-label={t("login.password", locale)}
          placeholder={t("login.password", locale)}
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
        <button type="submit" class="btn btn-primary" disabled={busy || password === ""}>
          {t("login.button", locale)}
        </button>
      </div>
      {error && (
        <div class="text-danger small mt-2" data-testid="addons-login-error">
          {error}
        </div>
      )}
    </form>
  );
}

function loginErrorText(err: unknown, locale: string): string {
  if (err instanceof ApiError && err.status === 401) return t("login.wrongPassword", locale);
  return t("login.failed", locale, { message: (err as Error).message });
}
