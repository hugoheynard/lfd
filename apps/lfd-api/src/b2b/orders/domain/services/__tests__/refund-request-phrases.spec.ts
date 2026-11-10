import { refundFailurePhraseOf } from "../refund-request-phrases.js";

/**
 * La phrase du dernier échec d'une demande (C4.9 ; plan M2, §3.3, §5.3) :
 * le bloc `card-payment` rend le code BRUT, le commerce en fait la phrase —
 * étendue aux états `stopped` et `settled_elsewhere` au lot P1.c.
 */
describe("refundFailurePhraseOf", () => {
  it.each(["refunded", "settled_elsewhere", "issued"] as const)(
    "une demande `%s` n'a pas de phrase, quel que soit son dernier échec",
    (state) => {
      expect(refundFailurePhraseOf(state, "unavailable", 3)).toBeNull();
    },
  );

  it("`to_issue` jamais tentée : pas de phrase", () => {
    expect(refundFailurePhraseOf("to_issue", null, 0)).toBeNull();
  });

  it("`to_issue` après un prestataire muet : le système réessaie, avec le compte des essais", () => {
    expect(refundFailurePhraseOf("to_issue", "unavailable", 1)).toBe(
      "Stripe n'a pas répondu (1 essai). Le système réessaie tout seul.",
    );
    expect(refundFailurePhraseOf("to_issue", "unavailable", 3)).toContain("(3 essais)");
  });

  it.each([
    ["refund_failed", "La banque a refusé le remboursement"],
    ["refund_canceled", "annulé chez Stripe"],
    ["reversed", "repris par la banque"],
    ["nothing_left", "déjà rendu"],
    ["no_intent", "aucun paiement Stripe"],
    ["issued_amount_mismatch", "un autre montant"],
    ["declined:charge_disputed", "Stripe a refusé le remboursement (charge_disputed)"],
    ["rejected:exceeds_charge", "dépasseraient ce qui a été encaissé"],
  ])("`stopped` sur `%s` nomme le cas et le geste de sortie", (failure, phrase) => {
    expect(refundFailurePhraseOf("stopped", failure, 1)).toContain(phrase);
  });

  it("`stopped` sans échec (une inversion née arrêtée) : elle attend une décision", () => {
    expect(refundFailurePhraseOf("stopped", null, 0)).toContain("attend une décision");
  });

  it("un code inconnu se dit tel quel plutôt que d'être tu", () => {
    expect(refundFailurePhraseOf("stopped", "rejected:inconnu", 1)).toBe(
      "Le remboursement n'est pas parti (rejected:inconnu).",
    );
    expect(refundFailurePhraseOf("to_issue", "panne_neuve", 1)).toBe(
      "Le remboursement n'est pas parti (panne_neuve).",
    );
  });
});
