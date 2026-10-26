import { CollectionTestLookalikeError } from "../../errors/collection-test-errors.js";
import { CREATED_AT, generated } from "../../entities/__tests__/collection-test-fixtures.js";
import {
  LOOKALIKE_WINDOW_DAYS,
  assertNoLookalike,
  lookalikeWindowStart,
  type PriorCollectionTest,
} from "../collection-test-lookalike.js";

/**
 * La garde anti-doublon (réponse 21 de la banque, décision de Hugo du
 * 2026-10-26). Les instants sont dérivés de `CREATED_AT`, qui joue l'horloge :
 * ils ne sont comparés qu'à lui.
 */
const DAY_MS = 86_400_000;

function prior(daysBefore: number, amountCents = 100): PriorCollectionTest {
  return {
    endToEndId: "ESS-PRECEDENT",
    amountCents,
    createdAt: new Date(CREATED_AT.getTime() - daysBefore * DAY_MS),
  };
}

describe("la garde anti-doublon d'un essai", () => {
  it("la fenêtre fait quinze jours", () => {
    expect(LOOKALIKE_WINDOW_DAYS).toBe(15);
    expect(lookalikeWindowStart(CREATED_AT)).toEqual(prior(15).createdAt);
  });

  it("refuse le même montant dans la fenêtre, en nommant l'essai, son jour et la sortie", () => {
    const attempt = () => assertNoLookalike([prior(3)], 100, CREATED_AT);

    expect(attempt).toThrow(CollectionTestLookalikeError);
    expect(attempt).toThrow(/ESS-PRECEDENT.*le 2026-10-19.*Choisissez un autre montant/s);
  });

  it("refuse encore à la borne exacte des quinze jours", () => {
    expect(() => assertNoLookalike([prior(15)], 100, CREATED_AT)).toThrow(
      CollectionTestLookalikeError,
    );
  });

  it("admet un autre montant dans la fenêtre", () => {
    expect(() => assertNoLookalike([prior(3, 99)], 100, CREATED_AT)).not.toThrow();
  });

  it("admet le même montant au-delà de la fenêtre", () => {
    expect(() => assertNoLookalike([prior(16)], 100, CREATED_AT)).not.toThrow();
  });

  it("l'agrégat refuse de générer le jumeau d'un essai récent", () => {
    expect(() => generated({ recentOnMandate: [prior(1)] })).toThrow(CollectionTestLookalikeError);
    expect(generated({ recentOnMandate: [prior(1, 50)] }).amountCents).toBe(100);
  });
});
