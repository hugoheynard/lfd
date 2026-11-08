import { InvalidMailSendCursorError } from "../../domain/errors/mail-sends.errors.js";
import { decodeMailSendCursor, encodeMailSendCursor } from "../mail-send-cursor.js";

describe("le curseur de la liste du suivi", () => {
  const position = { rank: 1, requestedAt: new Date(Date.UTC(2026, 0, 1, 8)), id: "01J|X" };

  it("rend la position qu'il a encodée, identifiant compris", () => {
    expect(decodeMailSendCursor(encodeMailSendCursor(position))).toEqual(position);
  });

  it("est opaque : ni l'instant ni l'identifiant n'y paraissent en clair", () => {
    expect(encodeMailSendCursor(position)).not.toContain("2026");
  });

  it.each(["", "n'importe-quoi", Buffer.from("x|pas-une-date|id").toString("base64url")])(
    "refuse un curseur qui n'a pas été rendu par la liste (%s)",
    (cursor) => {
      expect(() => decodeMailSendCursor(cursor)).toThrow(InvalidMailSendCursorError);
    },
  );
});
