import type { OrderSheetDetails } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../production-day.js";
import { AT, LATER, opened, order } from "./production-day-fixtures.js";

const DETAILS: OrderSheetDetails = {
  tradeName: "Hôtel des Trois Ponts",
  legalName: "SAS Trois Ponts",
  pickupLabel: null,
  address: { line1: "3 rue du Four", line2: "", postalCode: "73150", city: "Val d'Isère" },
  window: { start: "07:00", end: "08:00" },
  contact: { source: "order", name: "Léa Martin", phone: "0600000000" },
  signatureRequired: true,
  note: "Sonner deux fois",
  recurring: true,
};

describe("la journée et le colisage (plan colisage, K1)", () => {
  it("une journée ouverte appartient à l'ancien poste", () => {
    expect(opened().packingOwner).toBe("legacy");
  });

  it("la clôture écrit `packing` et fige l'échéance de chaque commande", () => {
    // K2 (2026-10-04, « on bascule direct ») : toute journée arrêtée par ce
    // binaire naît au colisage. Le binaire de K1 écrivait `legacy`.
    const day = opened();
    expect(day.packingOwner).toBe("legacy");

    day.close(
      [order({ dueAt: "07:30" }), order({ orderId: "ord_2", dueAt: null })],
      new Set<string>(),
      AT,
      null,
    );

    expect(day.packingOwner).toBe("packing");
    expect(day.toSnapshot().packingOwner).toBe("packing");
    expect(day.orders.map((sheet) => sheet.dueAt)).toEqual(["07:30", null]);
  });

  it("le retirage fige l'échéance des commandes qu'il absorbe", () => {
    const day = opened();
    day.close([order()], new Set<string>(), AT, null);

    day.retake(
      [order(), order({ orderId: "ord_2", dueAt: "09:00" })],
      new Set<string>(),
      LATER,
      "staff-1",
      null,
    );

    expect(day.orders.map((sheet) => sheet.dueAt)).toEqual([null, "09:00"]);
  });

  it("la clôture fige le reste du bon, tel que le commerce l'a résolu (E1b)", () => {
    const day = opened();

    day.close([order({ sheetDetails: DETAILS })], new Set<string>(), AT, null);

    expect(day.orders[0]?.sheetDetails).toEqual(DETAILS);
  });

  it("le retirage fige le bon des commandes qu'il absorbe, et laisse celui des autres", () => {
    const day = opened();
    day.close([order()], new Set<string>(), AT, null);

    day.retake(
      [order({ sheetDetails: DETAILS }), order({ orderId: "ord_2", sheetDetails: DETAILS })],
      new Set<string>(),
      LATER,
      "staff-1",
      null,
    );

    expect(day.orders.map((sheet) => sheet.sheetDetails)).toEqual([null, DETAILS]);
  });

  it("la clôture fige la clientèle de chaque commande, inconnue comprise", () => {
    const day = opened();

    day.close(
      [
        order({ clientele: "pro" }),
        order({ orderId: "ord_2", clientele: "public" }),
        order({ orderId: "ord_3", clientele: null }),
      ],
      new Set<string>(),
      AT,
      null,
    );

    expect(day.orders.map((sheet) => sheet.clientele)).toEqual(["pro", "public", null]);
  });

  it("le retirage fige la clientèle des commandes qu'il absorbe", () => {
    const day = opened();
    day.close([order({ clientele: "pro" })], new Set<string>(), AT, null);

    day.retake(
      [order({ clientele: "pro" }), order({ orderId: "ord_2", clientele: "public" })],
      new Set<string>(),
      LATER,
      "staff-1",
      null,
    );

    expect(day.orders.map((sheet) => sheet.clientele)).toEqual(["pro", "public"]);
  });

  it("le propriétaire survit à l'aller-retour par l'instantané", () => {
    const snapshot = opened().toSnapshot();
    expect(ProductionDay.fromSnapshot({ ...snapshot, packingOwner: "packing" }).packingOwner).toBe(
      "packing",
    );
  });
});
