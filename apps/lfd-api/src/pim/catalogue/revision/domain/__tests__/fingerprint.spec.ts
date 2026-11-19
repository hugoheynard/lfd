import { UnserializableRevisionPayloadError } from "../errors/revision-errors.js";
import { canonical, toJsonObject } from "../fingerprint.js";

describe("toJsonObject — ce qui se stocke est ce qui se hache", () => {
  it("rend un objet JSON, sans les clés indéfinies", () => {
    expect(toJsonObject({ a: 1, b: undefined, c: [true, null, "x"] })).toEqual({
      a: 1,
      c: [true, null, "x"],
    });
  });

  it.each([
    ["un nombre infini", { price: Number.POSITIVE_INFINITY }],
    ["NaN", { price: Number.NaN }],
    ["une date", { at: new Date(0) }],
    ["un Map", { names: new Map([["a", 1]]) }],
  ])("refuse %s par une erreur technique nommée", (_case, payload) => {
    expect(() => toJsonObject(payload)).toThrow(UnserializableRevisionPayloadError);
  });
});

describe("canonical — l'ordre des clés ne change pas l'empreinte", () => {
  it("trie les clés à tous les étages, garde l'ordre des tableaux", () => {
    expect(canonical({ b: 1, a: { d: [2, 1], c: 0 } })).toBe('{"a":{"c":0,"d":[2,1]},"b":1}');
  });
});
