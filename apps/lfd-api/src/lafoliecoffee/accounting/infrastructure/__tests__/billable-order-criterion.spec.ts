import { awaitsRemainder } from "../billable-order-criterion.js";

/**
 * Un bon remis sans solde attend-il un reste (plan E6c2, § 1, relecture de
 * `vitruve`) ? Attendu : écarté et signalé. Sinon : anomalie, bloquante.
 */
describe("awaitsRemainder", () => {
  const none = { shortfallDecisions: [], _count: { deliveryNotes: 0 } };

  it("rien en attente, pas de décision : anomalie", () => {
    expect(awaitsRemainder(none)).toBe(false);
  });

  it("reste abandonné, aucun BL à remettre : anomalie", () => {
    expect(awaitsRemainder({ ...none, shortfallDecisions: [{ remainder: "abandoned" }] })).toBe(
      false,
    );
  });

  it("reste à relivrer (E7) : attendu", () => {
    expect(awaitsRemainder({ ...none, shortfallDecisions: [{ remainder: "to_redeliver" }] })).toBe(
      true,
    );
  });

  /** Plan E7 reliquat, LB : une décision par envoi ; une seule « à relivrer » suffit. */
  it("deux envois décidés, l'un abandonné, l'autre à relivrer : attendu", () => {
    expect(
      awaitsRemainder({
        ...none,
        shortfallDecisions: [{ remainder: "abandoned" }, { remainder: "to_redeliver" }],
      }),
    ).toBe(true);
  });

  it("un BL ni remis ni annulé : attendu", () => {
    expect(awaitsRemainder({ ...none, _count: { deliveryNotes: 1 } })).toBe(true);
  });
});
