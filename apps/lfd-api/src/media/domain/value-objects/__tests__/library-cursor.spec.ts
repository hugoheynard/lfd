import {
  decodeLibraryCursor,
  encodeLibraryCursor,
  InvalidLibraryCursorError,
} from "../library-cursor.js";
import type { LibraryPosition } from "../library-order.js";

const URL_A = "https://media.test/products/a.png";

function encodedJson(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

describe("le curseur de la médiathèque", () => {
  it.each<LibraryPosition>([
    { sort: "deposited", key: "2026-03-04T05:06:07.089Z", url: URL_A },
    { sort: "name", key: "Croissant « doré » / été", url: URL_A },
    { sort: "name", key: "", url: URL_A },
    { sort: "uses", key: 3, url: URL_A },
    { sort: "uses", key: 0, url: URL_A },
  ])("relit exactement la position qu'il encode ($sort, $key)", (position) => {
    const cursor = encodeLibraryCursor(position);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLibraryCursor(cursor, position.sort)).toEqual(position);
  });

  it.each([
    ["vide de sens", "pas-un-curseur"],
    ["hors alphabet base64url", "abc+/="],
    ["démesuré", "a".repeat(5000)],
    ["sans version", encodedJson({ s: "uses", k: 1, u: URL_A })],
    ["d'un ordre inconnu", encodedJson({ v: 1, s: "shot", k: 1, u: URL_A })],
    ["sans URL", encodedJson({ v: 1, s: "uses", k: 1, u: "" })],
    ["un tableau", encodedJson([1, 2])],
  ])("refuse un curseur %s", (_case, raw) => {
    expect(() => decodeLibraryCursor(raw, "uses")).toThrow(InvalidLibraryCursorError);
  });

  it.each([
    ["deposited", "hier"],
    ["deposited", "2026-03-04"],
    ["uses", -1],
    ["uses", 1.5],
    ["uses", "3"],
    ["name", 3],
  ] as const)("refuse une clé qui n'est pas de l'ordre %s (%s)", (sort, key) => {
    expect(() =>
      decodeLibraryCursor(encodedJson({ v: 1, s: sort, k: key, u: URL_A }), sort),
    ).toThrow(InvalidLibraryCursorError);
  });

  it("refuse un curseur émis pour un autre ordre, en le nommant", () => {
    const cursor = encodeLibraryCursor({ sort: "uses", key: 2, url: URL_A });

    expect(() => decodeLibraryCursor(cursor, "name")).toThrow(/tri « uses », demandé « name »/);
  });
});
