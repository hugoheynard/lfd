// Les décisions de l'objet des journées (`documentation/caching-usage/
// plan-objet-des-journees.md`, lot 1) — `day-versions.ts` ne fait que les
// relier au stockage SQLite, et ces fonctions pures sont sous tests.

/** L'hôte fictif que le conteneur appelle et que le Worker intercepte. */
export const DAY_VERSIONS_HOST = "journees.interne";

/** L'adresse complète, posée par le Worker dans l'environnement du conteneur. */
export const DAY_VERSIONS_ORIGIN = `http://${DAY_VERSIONS_HOST}`;

/** Le nom de la variable que `AppConfig.dayVersionsCacheUrl()` lit. */
export const DAY_VERSIONS_ENV = "DAY_VERSIONS_CACHE_URL";

/** Au-delà, une journée est oubliée à l'écriture suivante (§ 3). */
export const FORGET_AFTER_DAYS = 3;

const DAY_MS = 86_400_000;
const SERVICE_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const DAY_PATH = /^\/days\/([^/]+)$/u;

/** Une carte, telle qu'elle voyage et se garde. */
export interface DayCard {
  readonly versions: Readonly<Record<string, number>>;
  readonly readAtMs: number;
}

/** Un appel compris par l'objet. */
export type DayVersionsCall =
  | { readonly kind: "read"; readonly key: string }
  | { readonly kind: "store"; readonly key: string; readonly serviceDay: string };

/**
 * La clé de stockage : la révision du code et la journée. Une révision vide
 * reste une clé distincte : elle ne se mélange à aucune autre.
 */
export function cardKeyOf(revision: string, serviceDay: string): string {
  return `r:${encodeURIComponent(revision)}/${serviceDay}`;
}

/** Lit un appel ; `null` = rien que l'objet comprenne (400). */
export function parseDayVersionsCall(method: string, url: URL): DayVersionsCall | null {
  const match = DAY_PATH.exec(url.pathname);
  const serviceDay = match === null ? null : decoded(match[1] ?? "");
  const revision = url.searchParams.get("revision");
  if (serviceDay === null || !SERVICE_DAY.test(serviceDay) || revision === null) {
    return null;
  }
  const key = cardKeyOf(revision, serviceDay);
  if (method === "GET") {
    return { kind: "read", key };
  }
  return method === "PUT" ? { kind: "store", key, serviceDay } : null;
}

/** Le corps d'un rangement ; `null` s'il n'a pas la forme d'une carte. */
export function parseDayCard(raw: unknown): DayCard | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const readAtMs: unknown = Reflect.get(raw, "readAtMs");
  const versions: unknown = Reflect.get(raw, "versions");
  if (!isWholeNumber(readAtMs) || typeof versions !== "object" || versions === null) {
    return null;
  }
  const kept: Record<string, number> = {};
  for (const [journal, version] of Object.entries(versions)) {
    if (!isWholeNumber(version)) {
      return null;
    }
    kept[journal] = version;
  }
  return { versions: kept, readAtMs };
}

/**
 * Une carte remplace la gardée seulement si elle a été LUE plus récemment —
 * jamais par comparaison des numéros, qui ne s'ordonnent pas (§ 3 bis).
 */
export function acceptsCard(keptReadAtMs: number | null, incomingReadAtMs: number): boolean {
  return keptReadAtMs === null || incomingReadAtMs > keptReadAtMs;
}

/**
 * La première journée gardée : celles d'avant ont plus de
 * {@link FORGET_AFTER_DAYS} jours au moment de la lecture qui écrit.
 */
export function oldestKeptDay(readAtMs: number): string {
  return new Date(readAtMs - FORGET_AFTER_DAYS * DAY_MS).toISOString().slice(0, 10);
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function decoded(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
