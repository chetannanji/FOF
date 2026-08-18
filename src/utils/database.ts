export function normalizeDatabaseUrl(rawUrl?: string): string {
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local");

    if (!isLocalHost && !url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }

    return url.toString();
  } catch (error) {
    console.warn("Failed to parse DATABASE_URL, falling back to raw value:", error);
    return rawUrl;
  }
}

