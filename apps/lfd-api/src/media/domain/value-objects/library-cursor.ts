import { DomainError } from "../../../platform/shared/errors/app-error.js";

import {
  acceptsKey,
  isLibrarySort,
  type LibraryPosition,
  type LibrarySort,
} from "./library-order.js";

/**
 * Un curseur plus long ne vient pas de nous : ceux qu'on émet tiennent en
 * quelques centaines de caractères (une URL, une étiquette bornée).
 */
const MAX_CURSOR_LENGTH = 2048;
const CURSOR_VERSION = 1;

/**
 * Un `?after=` qu'on ne sait pas lire.
 *
 * 🔴 Un refus, jamais un retour à la première page : repartir du début en
 * silence ferait réafficher des images déjà vues, et l'écran les doublerait.
 */
export class InvalidLibraryCursorError extends DomainError {
  constructor(reason: string) {
    super(
      "media.library.invalid_cursor",
      `Curseur de la médiathèque illisible (${reason}). Rechargez la médiathèque depuis le début : le curseur se reprend tel que la page précédente l'a rendu, sans le modifier.`,
    );
  }
}

/**
 * **Le curseur** — une position, en JSON, en base64url.
 *
 * Opaque pour l'écran, qui le renvoie tel quel. Il n'est PAS signé : il ne dit
 * qu'où reprendre la lecture d'un fonds que le lecteur a déjà le droit de lire,
 * et en forger un ne fait que sauter des images qu'on pouvait voir.
 */
export function encodeLibraryCursor(position: LibraryPosition): string {
  const payload = { v: CURSOR_VERSION, s: position.sort, k: position.key, u: position.url };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Relit un curseur, et vérifie qu'il appartient à l'ordre demandé.
 *
 * @throws {InvalidLibraryCursorError} illisible, ou émis pour un autre ordre.
 */
export function decodeLibraryCursor(raw: string, sort: LibrarySort): LibraryPosition {
  const payload = parse(raw);
  if (!isRecord(payload) || payload["v"] !== CURSOR_VERSION) {
    throw new InvalidLibraryCursorError("forme inconnue");
  }
  const { s, k, u } = payload;
  if (!isLibrarySort(s) || typeof u !== "string" || u === "" || !acceptsKey(s, k)) {
    throw new InvalidLibraryCursorError("forme inconnue");
  }
  if (s !== sort) {
    // Un curseur de l'ordre « dépôt » appliqué à l'ordre « étiquette » ne veut
    // rien dire : sa clé n'est pas du même genre.
    throw new InvalidLibraryCursorError(`émis pour le tri « ${s} », demandé « ${sort} »`);
  }
  return { sort: s, key: k, url: u };
}

function parse(raw: string): unknown {
  if (raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new InvalidLibraryCursorError("caractères inattendus");
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new InvalidLibraryCursorError("contenu illisible");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
