// Les contenus versionnés de l'objet des journées
// (`documentation/caching-usage/le-cache-du-back-office.md`, § 4.5) : par
// (révision, clé opaque), la DERNIÈRE charge rangée et le numéro qu'elle
// porte. L'objet ne sait pas ce qu'il garde — des octets opaques, le JSON
// que l'API a compressé (gzip) ; ces fonctions pures sont sous
// tests, `day-versions.ts` les relie au stockage SQLite.

/**
 * Au-delà, une charge n'est pas rangée (413) : l'API la sert depuis la base.
 * Mesuré sur les octets reçus, c'est-à-dire compressés.
 */
export const CONTENT_MAX_BYTES = 1_048_576;

const CONTENT_PATH = /^\/contents\/([^/]+)$/u;
// `:` sépare une famille de contenus de son sujet (`pim-product:<id>`) : l'onglet
// Cache regroupe les contenus par ce préfixe (`cache-metrics-store.ts`).
const CONTENT_KEY = /^[a-z0-9:-]{1,64}$/u;
const WHOLE = /^\d+$/u;

/** Un appel de contenu compris par l'objet. */
export interface ContentCall {
  readonly kind: "content-read" | "content-store";
  readonly key: string;
  readonly version: number;
  /** Le début de toute clé rangée sous cette révision (`r:<révision>/`). */
  readonly revisionPrefix: string;
}

/** La clé de stockage : la révision du code et la clé opaque de l'appelant. */
export function contentKeyOf(revision: string, key: string): string {
  return `r:${encodeURIComponent(revision)}/${key}`;
}

/** Lit un appel `/contents/<clé>?revision=…&version=…` ; `null` = rien de compris. */
export function parseContentCall(method: string, url: URL): ContentCall | null {
  const match = CONTENT_PATH.exec(url.pathname);
  const key = decodedSegment(match?.[1] ?? null);
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
  const revisionPrefix = contentKeyOf(revision, "");
  if (method === "GET") {
    return { kind: "content-read", key: stored, version, revisionPrefix };
  }
  return method === "PUT" ? { kind: "content-store", key: stored, version, revisionPrefix } : null;
}

/** La charge gardée sert-elle cette question ? Par ÉGALITÉ du numéro, jamais par ordre. */
export function servesContent(keptVersion: number | null, askedVersion: number): boolean {
  return keptVersion !== null && keptVersion === askedVersion;
}

/** L'en-tête où l'API dit la taille en clair d'une charge (`durable-object-versioned-content-cache.ts`). */
export const CONTENT_RAW_BYTES_HEADER = "x-content-raw-bytes";

/** Une charge rangeable : des octets, non vides, sous le plafond. */
export function acceptsContentBody(body: Uint8Array): boolean {
  return body.byteLength > 0 && body.byteLength <= CONTENT_MAX_BYTES;
}

/** La taille en clair annoncée par l'API ; `null` si absente ou mal formée. */
export function rawBytesOf(header: string | null): number | null {
  if (header === null || !WHOLE.test(header)) {
    return null;
  }
  const bytes = Number(header);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

/** Le segment de chemin décodé (`%3A` → `:`) ; `null` s'il est mal encodé. */
function decodedSegment(segment: string | null): string | null {
  if (segment === null) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
