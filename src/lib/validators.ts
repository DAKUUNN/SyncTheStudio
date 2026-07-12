/** Port of input_validator.dart (the parts used by the auth screens). */

type Translator = (key: string, params?: Record<string, string | number>) => string;

const EMAIL_REGEX = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

export function validateEmail(email: string, t: Translator): string | null {
  const trimmed = email.trim();
  if (!trimmed) return t("register.emailRequired");
  if (!EMAIL_REGEX.test(trimmed)) return t("register.emailInvalid");
  return null;
}

export function validateUsername(username: string, t: Translator): string | null {
  const trimmed = username.trim();
  if (!trimmed) return t("register.usernameRequired");
  if (trimmed.length < 3) return t("register.usernameMin");
  return null;
}

export function validatePassword(password: string, t: Translator): string | null {
  if (!password) return t("register.passwordRequired");
  if (password.length < 6) return t("register.passwordMin");
  return null;
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
