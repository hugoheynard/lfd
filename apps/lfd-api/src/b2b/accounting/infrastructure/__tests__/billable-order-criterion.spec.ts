import { awaitsRemainder } from "../billable-order-criterion.js";

/**
 * Un bon remis sans solde attend-il un reste (plan E6c2, § 1, relecture de
 * `vitruve`) ? Attendu : écarté et signalé. Sinon : anomalie, bloquante.
 */
describe("awaitsRemainder", () => {
  const none = { shortfallDecision: null, _count: { deliveryNotes: 0 } };

  it("rien en attente, pas de décision : anomalie", () => {
    expect(awaitsRemainder(none)).toBe(false);
  });

  it("reste abandonné, aucun BL à remettre : anomalie", () => {
    expect(awaitsRemainder({ ...none, shortfallDecision: { remainder: "abandoned" } })).toBe(false);
  });

  it("reste à relivrer (E7) : attendu", () => {
    expect(awaitsRemainder({ ...none, shortfallDecision: { remainder: "to_redeliver" } })).toBe(
      true,
    );
  });

  it("un BL ni remis ni annulé : attendu", () => {
    expect(awaitsRemainder({ ...none, _count: { deliveryNotes: 1 } })).toBe(true);
  });
});
