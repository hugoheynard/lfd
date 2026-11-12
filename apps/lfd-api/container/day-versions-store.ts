// Les décisions de l'objet des journées (`documentation/caching-usage/
// plan-objet-des-journees.md`, et `plan-veilleur-unique.md` § 3.3 : une carte
// par portée, un instant de lecture par sujet) — `day-versions.ts` ne fait que
// les relier au stockage SQLite, et ces fonctions pures sont sous tests.

/** Le nom de la variable que `AppConfig.dayVersionsCacheUrl()` lit. */
export const DAY_VERSIONS_ENV = "DAY_VERSIONS_CACHE_URL";

/** Au-delà, une journée est oubliée à l'écriture suivante (§ 3) ; la portée globale, jamais. */
export const FORGET_AFTER_DAYS = 3;

const DAY_MS = 86_400_000;
const SERVICE_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const SCOPE_PATH = /^\/scopes\/([^/]+)$/u;

/** La portée des sujets globaux : jamais oubliée, elle n'a pas de journée. */
export const GLOBAL_SCOPE = "global";

/** Le numéro d'un sujet, et l'instant où l'API a commencé à le lire. */
export interface SubjectReading {
  readonly version: number;
  readonly readAtMs: number;
}

/** Une carte, telle qu'elle voyage : un numéro par sujet de la portée. */
export interface VersionsCard {
  readonly subjects: Readonly<Record<string, SubjectReading>>;
}

/** Un appel compris par l'objet. */
export type DayVersionsCall =
  | { readonly kind: "read"; readonly key: string }
  | { readonly kind: "store"; readonly key: string; readonly scope: string };

/**
 * La clé de stockage : la révision du code et la portée (une journée, ou
 * {@link GLOBAL_SCOPE}). Une révision vide reste une clé distincte : elle ne
 * se mélange à aucune autre.
 */
export function cardKeyOf(revision: string, scope: string): string {
  return `r:${encodeURIComponent(revision)}/${scope}`;
}

/** Lit un appel ; `null` = rien que l'objet comprenne (400). */
export function parseDayVersionsCall(method: string, url: URL): DayVersionsCall | null {
  const match = SCOPE_PATH.exec(url.pathname);
  const scope = match === null ? null : decoded(match[1] ?? "");
  const revision = url.searchParams.get("revision");
  if (scope === null || !isScope(scope) || revision === null) {
    return null;
  }
  const key = cardKeyOf(revision, scope);
  if (method === "GET") {
    return { kind: "read", key };
  }
  return method === "PUT" ? { kind: "store", key, scope } : null;
}

/** Le corps d'un rangement ; `null` s'il n'a pas la forme d'une carte. */
export function parseVersionsCard(raw: unknown): VersionsCard | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const subjects: unknown = Reflect.get(raw, "subjects");
  if (typeof subjects !== "object" || subjects === null) {
    return null;
  }
  const kept: Record<string, SubjectReading> = {};
  for (const [subject, entry] of Object.entries(subjects)) {
    const reading = readingOf(entry);
    if (reading === null) {
      return null;
    }
    kept[subject] = reading;
  }
  return { subjects: kept };
}

/**
 * Un numéro remplace le gardé du même sujet seulement s'il a été LU plus
 * récemment — jamais par comparaison des numéros, qui ne s'ordonnent pas.
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

function isScope(scope: string): boolean {
  return scope === GLOBAL_SCOPE || SERVICE_DAY.test(scope);
}

function readingOf(raw: unknown): SubjectReading | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const version: unknown = Reflect.get(raw, "version");
  const readAtMs: unknown = Reflect.get(raw, "readAtMs");
  return isWholeNumber(version) && isWholeNumber(readAtMs) ? { version, readAtMs } : null;
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
