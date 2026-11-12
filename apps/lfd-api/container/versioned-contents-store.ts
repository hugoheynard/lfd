// Les contenus versionnés de l'objet des journées
// (`documentation/caching-usage/plan-catalogue-du-back-office.md`, § 3.5) : par
// (révision, clé opaque), la DERNIÈRE charge rangée et le numéro qu'elle
// porte. L'objet ne sait pas ce qu'il garde ; ces fonctions pures sont sous
// tests, `day-versions.ts` les relie au stockage SQLite.

/** Au-delà, une charge n'est pas rangée (413) : l'API la sert depuis la base. */
export const CONTENT_MAX_BYTES = 1_048_576;

const CONTENT_PATH = /^\/contents\/([^/]+)$/u;
const CONTENT_KEY = /^[a-z0-9-]{1,64}$/u;
const WHOLE = /^\d+$/u;

/** Un appel de contenu compris par l'objet. */
export type ContentCall =
  | { readonly kind: "content-read"; readonly key: string; readonly version: number }
  | { readonly kind: "content-store"; readonly key: string; readonly version: number };

/** La clé de stockage : la révision du code et la clé opaque de l'appelant. */
export function contentKeyOf(revision: string, key: string): string {
  return `r:${encodeURIComponent(revision)}/${key}`;
}

/** Lit un appel `/contents/<clé>?revision=…&version=…` ; `null` = rien de compris. */
export function parseContentCall(method: string, url: URL): ContentCall | null {
  const match = CONTENT_PATH.exec(url.pathname);
  const key = match?.[1] ?? null;
  const revision = url.searchParams.get("revision");
  const rawVersion = url.searchParams.get("version") ?? "";
  const version = Number(rawVersion);
  if (
    key === null ||
    !CONTENT_KEY.test(key) ||
    revision === null ||
    !WHOLE.test(rawVersion) ||
    !Number.isSafeInteger(version)
  ) {
    return null;
  }
  const stored = contentKeyOf(revision, key);
  if (method === "GET") {
    return { kind: "content-read", key: stored, version };
  }
  return method === "PUT" ? { kind: "content-store", key: stored, version } : null;
}

/** La charge gardée sert-elle cette question ? Par ÉGALITÉ du numéro, jamais par ordre. */
export function servesContent(keptVersion: number | null, askedVersion: number): boolean {
  return keptVersion !== null && keptVersion === askedVersion;
}

/** Une charge rangeable : du JSON, sous le plafond. */
export function acceptsContentBody(body: string): boolean {
  if (new TextEncoder().encode(body).byteLength > CONTENT_MAX_BYTES) {
    return false;
  }
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}
