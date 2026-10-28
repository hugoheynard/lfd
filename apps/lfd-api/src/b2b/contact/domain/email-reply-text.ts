/**
 * **Le texte d'une réponse par e-mail** — pur, sans dépendance (plan
 * `documentation/demandes-client/plan-reponses-par-e-mail.md`, §2).
 *
 * La partie texte du message ; à défaut, le HTML réduit à du texte. Puis
 * l'historique cité est coupé, et le reste est TRONQUÉ à sa borne : un
 * message ne se refuse jamais pour sa longueur.
 *
 * ⚠️ La réduction du HTML n'est PAS la protection contre le XSS : c'est le
 * rendu qui l'est (interpolation seulement, jamais `innerHTML` — R3). Ce qui
 * sort d'ici est du texte, et doit être traité comme du texte non fiable.
 */

/** Ce qui suit un texte coupé à sa borne. */
export const TRUNCATION_MARK = "\n(tronqué)";

/** Une ligne d'attribution : « Le … a écrit : », « On … wrote: », « Il giorno … ha scritto: ». */
const ATTRIBUTION_START = /^\s*(?:Le|On|Il giorno)\s/u;
const ATTRIBUTION_END = /(?:a écrit|wrote|ha scritto)\s*:\s*$/u;
/** Une ligne citée. */
const QUOTED = /^\s*>/u;

/**
 * Le texte du message : la partie texte si elle dit quelque chose, sinon le
 * HTML réduit à du texte, sinon vide.
 */
export function replyTextOf(text: string | null, html: string | null): string {
  if (text !== null && text.trim() !== "") {
    return normalizeNewlines(text);
  }
  return html === null ? "" : htmlToText(html);
}

/**
 * Coupe l'historique cité : à la première ligne `>`, ou à la ligne
 * d'attribution qui l'annonce (sur une ligne, ou repliée sur deux).
 */
export function cutQuotedHistory(text: string): string {
  const lines = normalizeNewlines(text).split("\n");
  const cut = lines.findIndex((line, index) => startsHistory(line, lines[index + 1]));
  const kept = cut === -1 ? lines : lines.slice(0, cut);
  return kept.join("\n").trim();
}

function startsHistory(line: string, next: string | undefined): boolean {
  if (QUOTED.test(line)) {
    return true;
  }
  if (!ATTRIBUTION_START.test(line)) {
    return false;
  }
  return ATTRIBUTION_END.test(line) || (next !== undefined && ATTRIBUTION_END.test(next));
}

/** Le texte, rogné, et tronqué à `max` caractères mention comprise. */
export function truncated(text: string, max: number): string {
  const value = text.trim();
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - TRUNCATION_MARK.length)).trimEnd()}${TRUNCATION_MARK}`;
}

/** Un texte court (objet, nom) : rogné, ramené à une ligne, coupé à `max`. */
export function oneLine(text: string, max: number): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, max).trim();
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Le HTML réduit à du texte. L'historique cité d'un client HTML vit dans un
 * `<blockquote>` (ou le bloc `gmail_quote`) : tout ce qui suit le premier est
 * coupé avant même de lire les balises.
 */
export function htmlToText(html: string): string {
  const quoteAt = html.search(/<blockquote\b|<[^>]*class=["'][^"']*gmail_quote/iu);
  const body = quoteAt === -1 ? html : html.slice(0, quoteAt);
  const text = body
    .replace(/<(head|style|script)\b[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu, (whole, code: string) => decode(whole, code));
  return normalizeNewlines(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function decode(whole: string, code: string): string {
  const lower = code.toLowerCase();
  if (lower.startsWith("#x")) {
    return codePoint(Number.parseInt(lower.slice(2), 16), whole);
  }
  if (lower.startsWith("#")) {
    return codePoint(Number.parseInt(lower.slice(1), 10), whole);
  }
  return ENTITIES[lower] ?? whole;
}

/** Un point de code hors de l'Unicode rend l'entité telle quelle plutôt qu'une exception. */
function codePoint(value: number, whole: string): string {
  const MAX_CODE_POINT = 0x10ffff;
  return Number.isInteger(value) && value > 0 && value <= MAX_CODE_POINT
    ? String.fromCodePoint(value)
    : whole;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/gu, "\n");
}
