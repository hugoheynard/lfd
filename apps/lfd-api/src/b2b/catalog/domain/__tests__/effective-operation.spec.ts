import { effectiveOperation } from "../effective-operation.js";
import type { CatalogOperationFacts } from "../entities/catalog-operation.js";
import type { OperationRestriction } from "../entities/catalog-operation-override.js";

/**
 * D9 : la surcharge se COMBINE à la lecture. Les dates ne sont comparées
 * qu'entre elles — jamais à l'horloge : la fonction n'en a pas.
 */

const PIM_CLOSE = new Date("2026-12-21T11:00:00.000Z");

const noel: CatalogOperationFacts = {
  key: "noel-2026",
  name: { fr: "Noël" },
  lede: null,
  image: null,
  announceFrom: new Date("2026-10-31T23:00:00.000Z"),
  orderFrom: null,
  orderUntil: PIM_CLOSE,
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "both",
  skus: ["PAT-9-1", "VIE-001-1", "PAT-7-1"],
  receivedAt: new Date("2026-09-01T00:00:00.000Z"),
};

const nothing: OperationRestriction = {
  isHidden: false,
  orderUntil: null,
  audience: null,
  hiddenSkus: [],
};

describe("l'opération effective — le référentiel, restreint par la réception", () => {
  it("applique le référentiel tel quel quand rien n'est décidé ici", () => {
    expect(effectiveOperation(noel, null)).toEqual({
      key: "noel-2026",
      isHidden: false,
      orderUntil: PIM_CLOSE,
      audience: "both",
      skus: ["PAT-9-1", "VIE-001-1", "PAT-7-1"],
    });
  });

  it("ferme au plus tôt : une clôture de la réception plus précoce l'emporte", () => {
    const earlier = new Date("2026-12-19T17:00:00.000Z");

    expect(effectiveOperation(noel, { ...nothing, orderUntil: earlier }).orderUntil).toEqual(
      earlier,
    );
  });

  /**
   * 🔴 Régression évitée par construction : un envoi qui AVANCE la date du
   * référentiel ne rend jamais la surcharge « plus tardive ». La surcharge posée
   * au 22 ne rouvre pas une commande que le référentiel ferme au 21.
   */
  it("ne rouvre jamais : une clôture de la réception plus tardive n'a pas d'effet", () => {
    const later = new Date("2026-12-22T11:00:00.000Z");

    expect(effectiveOperation(noel, { ...nothing, orderUntil: later }).orderUntil).toEqual(
      PIM_CLOSE,
    );
  });

  it("restreint la clientèle en intersection", () => {
    expect(effectiveOperation(noel, { ...nothing, audience: "pro" }).audience).toBe("pro");
    expect(
      effectiveOperation({ ...noel, audience: "public" }, { ...nothing, audience: "pro" }).audience,
    ).toBe("none");
  });

  it("retire de la sélection les articles retirés à la réception, sans changer l'ordre", () => {
    expect(effectiveOperation(noel, { ...nothing, hiddenSkus: ["VIE-001-1"] }).skus).toEqual([
      "PAT-9-1",
      "PAT-7-1",
    ]);
  });

  it("dit qu'elle est masquée", () => {
    expect(effectiveOperation(noel, { ...nothing, isHidden: true }).isHidden).toBe(true);
  });
});
