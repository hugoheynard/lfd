import type { OrderSheetDetails } from "../../../channels/commerce/day-orders.reader.js";
import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { dossierSheetHeadOf } from "../dossier-sheet-head.js";

/** L'en-tête d'un bon du dossier : ce qu'il dit, avec et sans le bon figé (E1b). */

const DETAILS: OrderSheetDetails = {
  tradeName: "Hôtel des Trois Ponts",
  legalName: "SAS Trois Ponts",
  pickupLabel: null,
  address: { line1: "3 rue du Four", line2: "", postalCode: "73150", city: "Val d'Isère" },
  window: { start: "07:00", end: "08:30" },
  contact: { source: "holder", name: "Léa Martin", phone: "0600000000" },
  signatureRequired: true,
  note: "Sonner deux fois",
  recurring: true,
};

function order(overrides: Partial<ProductionOrderSnapshot> = {}): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: "ord_1",
    reference: "CMD-0001",
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "delivery",
    destination: "3 rue du Four, Val d'Isère",
    dueAt: "07:00",
    clientele: null,
    sheetDetails: DETAILS,
    lines: [],
    ...overrides,
  };
}

describe("dossierSheetHeadOf", () => {
  it("dit l'enseigne, la raison sociale, l'adresse en lignes, la fenêtre et ce que le livreur doit savoir", () => {
    expect(dossierSheetHeadOf(order())).toEqual({
      title: "Hôtel des Trois Ponts",
      subtitle: "SAS Trois Ponts",
      where: ["3 rue du Four", "73150 Val d'Isère"],
      when: "7 h 00 – 8 h 30",
      contact: "Léa Martin · 0600000000 · détenteur du compte",
      signature: "Signature exigée à la remise",
      origin: "Panier récurrent",
      note: "Sonner deux fois",
    });
  });

  it("sans enseigne, la raison sociale tient le titre seule", () => {
    const head = dossierSheetHeadOf(order({ sheetDetails: { ...DETAILS, tradeName: "" } }));
    expect(head.title).toBe("SAS Trois Ponts");
    expect(head.subtitle).toBeNull();
  });

  it("écrit « avant » sans début, et « Aucun contact sur place » plutôt qu'un blanc", () => {
    const head = dossierSheetHeadOf(
      order({ sheetDetails: { ...DETAILS, window: { start: null, end: "10:00" }, contact: null } }),
    );
    expect(head.when).toBe("avant 10 h 00");
    expect(head.contact).toBe("Aucun contact sur place");
  });

  it("au retrait : le point nommé d'abord, ni contact ni signature", () => {
    const head = dossierSheetHeadOf(
      order({
        fulfillmentMethod: "pickup",
        sheetDetails: {
          ...DETAILS,
          pickupLabel: "Le Labo",
          window: null,
          note: "",
          recurring: false,
        },
      }),
    );
    expect(head.where).toEqual(["Le Labo", "3 rue du Four", "73150 Val d'Isère"]);
    expect(head.when).toBe("Sans heure convenue");
    expect(head.contact).toBeNull();
    expect(head.signature).toBeNull();
    expect(head.origin).toBeNull();
    expect(head.note).toBeNull();
  });

  it("une commande figée avant le lot garde le rendu d'avant et omet le reste", () => {
    expect(dossierSheetHeadOf(order({ sheetDetails: null }))).toEqual({
      title: "Hôtel des Trois Ponts",
      subtitle: null,
      where: ["3 rue du Four, Val d'Isère"],
      when: "Pour 07:00",
      contact: null,
      signature: null,
      origin: null,
      note: null,
    });
  });
});
