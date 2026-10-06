import {
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
} from "../../errors/production-errors.js";
import type {
  OrderSheetDetails,
  ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";

/**
 * L'agrégat, éprouvé **sans Nest et sans base** : on instancie, on appelle une
 * méthode métier, on assert — y compris les refus, qui sont sa raison d'être.
 */

const AT = new Date("2026-09-07T18:00:00.000Z");
const LATER = new Date("2026-09-08T05:30:00.000Z");

function order(overrides: Partial<ProducibleOrder> = {}): ProducibleOrder {
  return {
    orderId: "ord_1",
    reference: "CMD-0001",
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 40 }],
    ...overrides,
  };
}

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

function opened(): ProductionDay {
  return ProductionDay.open(ServiceDay.of("2026-09-08"));
}

describe("arrêter une journée", () => {
  it("fige les commandes et compte ce qu'il y a à produire", () => {
    const day = opened();

    day.close([order()], AT, null);

    expect(day.isClosed).toBe(true);
    expect(day.closedAt).toBe(AT);
    expect(day.orders).toHaveLength(1);
    expect(day.counts).toEqual([
      // `done: null` : une journée qu'on vient d'arrêter n'a rien de sorti du
      // four. Écrit plutôt que laissé deviner — comme `packed` sur la commande.
      { sku: "VIE-001", productName: "Croissant", quantity: 40, done: null },
    ]);
  });

  it("ADDITIONNE le même article à travers les commandes", () => {
    // C'est tout l'objet du compte à produire : le fournil lance des fournées,
    // il ne prépare pas des sacs. Une liste par commande ne lui dirait pas
    // combien de croissants pousser au four.
    const day = opened();

    day.close(
      [
        order({
          orderId: "ord_1",
          lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 40 }],
        }),
        order({
          orderId: "ord_2",
          lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
        }),
      ],
      AT,
      null,
    );

    expect(day.counts).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 52, done: null },
    ]);
  });

  it("trie le compte par SKU — deux clôtures identiques rendent le même compte", () => {
    // Le PDF qu'on en tire est archivé, donc son rendu doit être déterministe.
    // Dans l'ordre d'arrivée des commandes, il ne le serait pas.
    const day = opened();

    day.close(
      [
        order({ lines: [{ sku: "VIE-009", productName: "Pain au lait", quantity: 5 }] }),
        order({
          orderId: "ord_2",
          lines: [{ sku: "PAI-001", productName: "Tradition", quantity: 3 }],
        }),
      ],
      AT,
      null,
    );

    expect(day.counts.map((item) => item.sku)).toEqual(["PAI-001", "VIE-009"]);
  });

  it("REFUSE de rouvrir une journée arrêtée", () => {
    // L'invariant qui coûte le plus cher : le compte à produire est un
    // instantané, et les commandes bougent après. Le recalculer donnerait un
    // autre nombre que celui sur lequel les fournées sont parties.
    const day = opened();
    day.close([order()], AT, null);

    expect(() => {
      day.close([order(), order({ orderId: "ord_2" })], AT, null);
    }).toThrow(ProductionDayAlreadyClosedError);
    expect(day.orders).toHaveLength(1);
  });

  it("REFUSE d'arrêter une journée vide", () => {
    // Fermer le vide écrirait « ce jour-là on a produit ceci » là où il n'y a
    // rien eu — et le zéro passerait pour une mesure.
    expect(() => {
      opened().close([], AT, null);
    }).toThrow(ProductionDayEmptyError);
  });
});

describe("le colisage, vu de la journée", () => {
  function closed(): ProductionDay {
    const day = opened();
    day.close([order(), order({ orderId: "ord_2", reference: "CMD-0002" })], AT, null);
    return day;
  }

  it("une journée fraîchement arrêtée n'a AUCUN bac fait", () => {
    // Écrit plutôt que deviné : un champ absent passerait pour un bac fait.
    // Le couple entier est `null`, pas un instant sans auteur — c'est ce que le
    // modèle rend inexprimable depuis le 2026-09-08.
    expect(closed().orders.every((o) => o.packed === null)).toBe(true);
  });
});

describe("le va-et-vient avec l'adaptateur", () => {
  it("se relit identique à ce qu'il a écrit", () => {
    const day = opened();
    day.close([order()], AT, null);

    const again = ProductionDay.fromSnapshot(day.toSnapshot());

    expect(again.toSnapshot()).toEqual(day.toSnapshot());
    expect(again.isClosed).toBe(true);
  });

  it("une journée relue et CLOSE refuse toujours de se rouvrir", () => {
    // La garde vit dans l'agrégat, pas dans le handler : elle doit donc survivre
    // au passage par la base, sinon elle ne protège que le premier appel.
    const day = opened();
    day.close([order()], AT, null);
    const again = ProductionDay.fromSnapshot(day.toSnapshot());

    expect(() => {
      again.close([order()], AT, null);
    }).toThrow(ProductionDayAlreadyClosedError);
  });
});

describe("le jour de service", () => {
  it("refuse ce qui n'est pas un jour ISO", () => {
    expect(() => ServiceDay.of("08/09/2026")).toThrow();
    expect(() => ServiceDay.of("")).toThrow();
  });

  it("accepte un jour bien formé, espaces compris", () => {
    expect(ServiceDay.of(" 2026-09-08 ").value).toBe("2026-09-08");
  });
});

describe("la journée et le colisage (plan colisage, K1)", () => {
  it("une journée ouverte appartient à l'ancien poste", () => {
    expect(opened().packingOwner).toBe("legacy");
  });

  it("la clôture écrit `packing` et fige l'échéance de chaque commande", () => {
    // K2 (2026-10-04, « on bascule direct ») : toute journée arrêtée par ce
    // binaire naît au colisage. Le binaire de K1 écrivait `legacy`.
    const day = opened();
    expect(day.packingOwner).toBe("legacy");

    day.close([order({ dueAt: "07:30" }), order({ orderId: "ord_2", dueAt: null })], AT, null);

    expect(day.packingOwner).toBe("packing");
    expect(day.toSnapshot().packingOwner).toBe("packing");
    expect(day.orders.map((sheet) => sheet.dueAt)).toEqual(["07:30", null]);
  });

  it("le retirage fige l'échéance des commandes qu'il absorbe", () => {
    const day = opened();
    day.close([order()], AT, null);

    day.retake([order(), order({ orderId: "ord_2", dueAt: "09:00" })], LATER, "staff-1", null);

    expect(day.orders.map((sheet) => sheet.dueAt)).toEqual([null, "09:00"]);
  });

  it("la clôture fige le reste du bon, tel que le commerce l'a résolu (E1b)", () => {
    const day = opened();

    day.close([order({ sheetDetails: DETAILS })], AT, null);

    expect(day.orders[0]?.sheetDetails).toEqual(DETAILS);
  });

  it("le retirage fige le bon des commandes qu'il absorbe, et laisse celui des autres", () => {
    const day = opened();
    day.close([order()], AT, null);

    day.retake(
      [order({ sheetDetails: DETAILS }), order({ orderId: "ord_2", sheetDetails: DETAILS })],
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
      AT,
      null,
    );

    expect(day.orders.map((sheet) => sheet.clientele)).toEqual(["pro", "public", null]);
  });

  it("le retirage fige la clientèle des commandes qu'il absorbe", () => {
    const day = opened();
    day.close([order({ clientele: "pro" })], AT, null);

    day.retake(
      [order({ clientele: "pro" }), order({ orderId: "ord_2", clientele: "public" })],
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

describe("ProductionDay — qui a arrêté, qui a complété", () => {
  it("garde l'auteur de l'arrêt et le nom de qui complète, jusque dans l'instantané", () => {
    const day = ProductionDay.open(ServiceDay.of("2026-10-07"));
    day.close([order()], AT, { kind: "staff", staffUserId: "s-1", name: "Marie Dupont" });
    day.retake([order(), order({ orderId: "ord_2" })], LATER, "s-2", "Paul Martin");

    const snapshot = day.toSnapshot();
    expect(snapshot.closedBy).toEqual({ kind: "staff", staffUserId: "s-1", name: "Marie Dupont" });
    expect(snapshot.retakenByName).toBe("Paul Martin");
    const again = ProductionDay.fromSnapshot(snapshot);
    expect(again.closedBy).toEqual(snapshot.closedBy);
    expect(again.retakenByName).toBe("Paul Martin");
  });

  it("une journée ouverte n'a pas d'auteur", () => {
    expect(ProductionDay.open(ServiceDay.of("2026-10-07")).closedBy).toBeNull();
  });
});
