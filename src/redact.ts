const SENSITIVE_QUERY_PARAMS = [
  "access_token",
  "token",
  "auth",
  "authorization",
  "password",
  "senha",
  "cookie",
  "session"
];

export function redactUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of [...url.searchParams.keys()]) {
      const lowerKey = key.toLowerCase();
      if (
        SENSITIVE_QUERY_PARAMS.some((sensitive) => lowerKey.includes(sensitive)) ||
        lowerKey.includes("email")
      ) {
        url.searchParams.set(key, "<REDACTED>");
      }
    }
    return url.toString();
  } catch {
    return input.replace(/(token|password|senha|authorization|cookie)=([^&\s]+)/gi, "$1=<REDACTED>");
  }
}

export function redactText(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  return input
    .replace(/("?(password|senha|token|authorization|cookie)"?\s*[:=]\s*)("[^"]+"|[^,&}\s]+)/gi, "$1<REDACTED>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <REDACTED>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<EMAIL_REDACTED>");
}
