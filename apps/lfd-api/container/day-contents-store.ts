// Les contenus des écrans de journée dans l'objet des journées
// (`documentation/caching-usage/le-cache-du-back-office.md`, § 3.1) : par
// (révision, écran, journée), la DERNIÈRE charge rangée et l'étiquette qu'elle
// porte — les numéros de ses sujets, en clair. Fonctions pures sous tests ;
// `day-contents.ts` les relie au stockage SQLite.

const DAY_CONTENT_PATH = /^\/day-contents\/([^/]+)\/([^/]+)$/u;
const SCREEN = /^[a-z][a-z0-9-]{0,39}$/u;
const SERVICE_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const SUBJECT = /^[a-z][a-z0-9-]{0,31}$/u;
const WHOLE = /^\d+$/u;
const TAG_MAX_LENGTH = 512;

/** Le préfixe des compteurs d'un écran dans l'onglet Cache : `day-<écran>`. */
export const DAY_CONTENTS_CACHE_PREFIX = "day-";

/** Un appel de contenu de journée compris par l'objet. */
export interface DayContentCall {
  readonly kind: "day-content-read" | "day-content-store";
  readonly key: string;
  readonly screen: string;
  readonly day: string;
  readonly tag: string;
}

/** La clé de stockage : la révision du code, l'écran et la journée. */
export function dayContentKeyOf(revision: string, screen: string, day: string): string {
  return `r:${encodeURIComponent(revision)}/${screen}/${day}`;
}

/** Le cache de l'onglet Cache d'un écran (`day-worksheet`, …). */
export function dayContentsCacheOf(screen: string): string {
  return `${DAY_CONTENTS_CACHE_PREFIX}${screen}`;
}

/**
 * Lit `/day-contents/<écran>/<AAAA-MM-JJ>?revision=…&tag=…` ; `null` = rien
 * de compris. L'étiquette doit être canonique (sujets triés, sans doublon) :
 * deux écritures d'une même étiquette ne peuvent pas différer.
 */
export function parseDayContentCall(method: string, url: URL): DayContentCall | null {
  const match = DAY_CONTENT_PATH.exec(url.pathname);
  const screen = decodedSegment(match?.[1] ?? null);
  const day = decodedSegment(match?.[2] ?? null);
  const revision = url.searchParams.get("revision");
  const tag = url.searchParams.get("tag");
  if (
    screen === null ||
    day === null ||
    revision === null ||
    tag === null ||
    !SCREEN.test(screen) ||
    !isServiceDay(day) ||
    parseDayContentTag(tag) === null
  ) {
    return null;
  }
  const key = dayContentKeyOf(revision, screen, day);
  if (method === "GET") {
    return { kind: "day-content-read", key, screen, day, tag };
  }
  return method === "PUT" ? { kind: "day-content-store", key, screen, day, tag } : null;
}

/**
 * Les numéros d'une étiquette `orders:12.production:4`, par sujet ; `null` si
 * elle n'est pas canonique (sujets non triés, doublon, numéro mal formé, vide).
 */
export function parseDayContentTag(tag: string): ReadonlyMap<string, number> | null {
  if (tag.length === 0 || tag.length > TAG_MAX_LENGTH) {
    return null;
  }
  const versions = new Map<string, number>();
  let previous = "";
  for (const part of tag.split(".")) {
    const [subject = "", raw = "", ...rest] = part.split(":");
    const version = Number(raw);
    if (
      rest.length > 0 ||
      !SUBJECT.test(subject) ||
      subject <= previous ||
      !WHOLE.test(raw) ||
      !Number.isSafeInteger(version)
    ) {
      return null;
    }
    versions.set(subject, version);
    previous = subject;
  }
  return versions;
}

/** La charge gardée sert-elle cette question ? Par ÉGALITÉ de l'étiquette, jamais par ordre. */
export function servesDayContent(keptTag: string | null, askedTag: string): boolean {
  return keptTag !== null && keptTag === askedTag;
}

/**
 * Un rangement remplace-t-il la ligne gardée ? Seulement si CHAQUE numéro de
 * son étiquette est ≥ celui gardé : les numéros ne font que monter, et une
 * lecture plus ancienne ne doit pas écraser une plus récente. Aucune horloge
 * n'entre dans la décision.
 *
 * **Étiquettes incomparables** (l'une plus haute sur un sujet, plus basse sur
 * un autre — deux lectures entrelacées) : on GARDE la ligne. Les deux sont
 * déjà périmées sur au moins un sujet ; la prochaine lecture lira des numéros
 * ≥ aux deux (ils ne descendent pas), dominera donc la ligne gardée et la
 * remplacera. Remplacer ferait alterner deux rangements concurrents sans
 * rendre aucune lecture juste plus tôt, puisqu'on ne sert qu'à étiquette
 * égale. Même règle pour deux ensembles de sujets différents sous une même
 * révision : ce n'est pas une suite de la même lecture, on garde.
 */
export function replacesDayContent(keptTag: string | null, incomingTag: string): boolean {
  if (keptTag === null) {
    return true;
  }
  const kept = parseDayContentTag(keptTag);
  const incoming = parseDayContentTag(incomingTag);
  if (kept === null) {
    return true;
  }
  if (incoming === null || incoming.size !== kept.size) {
    return false;
  }
  for (const [subject, version] of kept) {
    const next = incoming.get(subject);
    if (next === undefined || next < version) {
      return false;
    }
  }
  return true;
}

function isServiceDay(day: string): boolean {
  if (!SERVICE_DAY.test(day)) {
    return false;
  }
  const at = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(day);
}

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
