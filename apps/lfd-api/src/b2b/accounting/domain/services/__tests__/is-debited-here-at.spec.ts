import { isDebitedHereAt } from "../collection-verdict.js";
import { ENTITY_ID, mandate } from "./collection-fixtures.js";

/** Les dates ne sont comparées qu'entre elles (signature ≤ instant jugé). */
const AT = new Date("2026-09-30T22:00:00.000Z");

function context(mandates: ReturnType<typeof mandate>[], consumed: readonly string[] = []) {
  return {
    legalEntityId: ENTITY_ID,
    at: AT,
    follows: [],
    mandates,
    collectionForms: new Map(),
    consumedMandates: new Set(consumed),
  };
}

describe("isDebitedHereAt — débité chez cette entité à cet instant", () => {
  it("un mandat actif chez l'entité : oui", () => {
    expect(isDebitedHereAt("a", context([mandate("a")]))).toBe(true);
  });

  it("aucun mandat : non", () => {
    expect(isDebitedHereAt("a", context([]))).toBe(false);
  });

  it("un mandat chez une autre entité : non", () => {
    expect(isDebitedHereAt("a", context([mandate("a", { creditorId: "other" })]))).toBe(false);
  });

  it("un mandat ponctuel déjà consommé : non", () => {
    const oneOff = mandate("a", { paymentType: "one_off" });
    expect(isDebitedHereAt("a", context([oneOff], [oneOff.mandateId]))).toBe(false);
  });
});
