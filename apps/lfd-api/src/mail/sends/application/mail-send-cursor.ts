import { InvalidMailSendCursorError } from "../domain/errors/mail-sends.errors.js";
import type { MailSendPosition } from "../domain/ports/mail-send.reader.js";

/**
 * Le curseur de la liste du suivi : la position de la dernière ligne servie
 * (rang de problème, instant, identifiant), en `base64url` — opaque pour le
 * back-office, qui le repasse tel quel.
 */
export function encodeMailSendCursor(position: MailSendPosition): string {
  const raw = `${String(position.rank)}|${position.requestedAt.toISOString()}|${position.id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/**
 * @throws {InvalidMailSendCursorError} le curseur n'a pas été rendu par la liste.
 */
export function decodeMailSendCursor(cursor: string): MailSendPosition {
  const [rank, at, ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const id = rest.join("|");
  const requestedAt = new Date(at ?? "");
  const parsedRank = Number(rank);
  if (!Number.isInteger(parsedRank) || Number.isNaN(requestedAt.getTime()) || id === "") {
    throw new InvalidMailSendCursorError();
  }
  return { rank: parsedRank, requestedAt, id };
}
