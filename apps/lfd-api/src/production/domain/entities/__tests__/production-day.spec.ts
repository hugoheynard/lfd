import {
  AtelierSheetNotFoundError,
  OrderAlreadyPackedError,
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "../../errors/production-errors.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
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
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 40 }],
    ...overrides,
  };
}

function opened(): ProductionDay {
  return ProductionDay.open(ServiceDay.of("2026-09-08"));
}

describe("arrêter une journée", () => {
  it("fige les commandes et compte ce qu'il y a à produire", () => {
    const day = opened();

    day.close([order()], AT);

    expect(day.isClosed).toBe(true);
    expect(day.closedAt).toBe(AT);
    expect(day.orders).toHaveLength(1);
    expect(day.counts).toEqual([{ sku: "VIE-001", productName: "Croissant", quantity: 40 }]);
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
    );

    expect(day.counts).toEqual([{ sku: "VIE-001", productName: "Croissant", quantity: 52 }]);
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
    );

    expect(day.counts.map((item) => item.sku)).toEqual(["PAI-001", "VIE-009"]);
  });

  it("REFUSE de rouvrir une journée arrêtée", () => {
    // L'invariant qui coûte le plus cher : le compte à produire est un
    // instantané, et les commandes bougent après. Le recalculer donnerait un
    // autre nombre que celui sur lequel les fournées sont parties.
    const day = opened();
    day.close([order()], AT);

    expect(() => {
      day.close([order(), order({ orderId: "ord_2" })], AT);
    }).toThrow(ProductionDayAlreadyClosedError);
    expect(day.orders).toHaveLength(1);
  });

  it("REFUSE d'arrêter une journée vide", () => {
    // Fermer le vide écrirait « ce jour-là on a produit ceci » là où il n'y a
    // rien eu — et le zéro passerait pour une mesure.
    expect(() => {
      opened().close([], AT);
    }).toThrow(ProductionDayEmptyError);
  });
});

describe("coliser une commande", () => {
  function closed(): ProductionDay {
    const day = opened();
    day.close([order(), order({ orderId: "ord_2", reference: "CMD-0002" })], AT);
    return day;
  }

  it("marque le bac fait, avec qui l'a déclaré", () => {
    const day = closed();

    const packed = day.pack("CMD-0001", LATER, "auth0|karim");

    expect(packed.packedAt).toBe(LATER);
    expect(packed.packedBy).toBe("auth0|karim");
    // Les AUTRES commandes de la journée n'ont pas bougé : coliser l'une ne dit
    // rien de l'autre, et le fournil ferme les bacs un par un.
    expect(day.orders.find((o) => o.reference === "CMD-0002")?.packedAt).toBeNull();
  });

  it("REFUSE un bac déjà fait — le premier scan est le seul vrai", () => {
    // Deux mains sur la même feuille est le cas NORMAL au fournil. Le second
    // scan ne doit ni réécrire l'heure ni changer l'identité qui l'a déclaré.
    const day = closed();
    day.pack("CMD-0001", LATER, "auth0|karim");

    expect(() => day.pack("CMD-0001", AT, "auth0|lea")).toThrow(OrderAlreadyPackedError);
    const still = day.orders.find((o) => o.reference === "CMD-0001");
    expect(still?.packedAt).toBe(LATER);
    expect(still?.packedBy).toBe("auth0|karim");
  });

  it("REFUSE une référence qui n'est pas dans cette journée", () => {
    expect(() => closed().pack("CMD-9999", LATER, "auth0|karim")).toThrow(
      AtelierSheetNotFoundError,
    );
  });

  it("REFUSE une journée qui n'est pas arrêtée", () => {
    // Une commande qu'aucune clôture n'a inscrite n'est pas à fabriquer
    // aujourd'hui : la déclarer colisée créerait un fait sur une journée vide.
    expect(() => opened().pack("CMD-0001", LATER, "auth0|karim")).toThrow(
      ProductionDayNotClosedError,
    );
  });

  it("une journée fraîchement arrêtée n'a AUCUN bac fait", () => {
    // Écrit plutôt que deviné : un champ absent passerait pour un bac fait.
    expect(closed().orders.every((o) => o.packedAt === null)).toBe(true);
  });
});

describe("le va-et-vient avec l'adaptateur", () => {
  it("se relit identique à ce qu'il a écrit", () => {
    const day = opened();
    day.close([order()], AT);

    const again = ProductionDay.fromSnapshot(day.toSnapshot());

    expect(again.toSnapshot()).toEqual(day.toSnapshot());
    expect(again.isClosed).toBe(true);
  });

  it("une journée relue et CLOSE refuse toujours de se rouvrir", () => {
    // La garde vit dans l'agrégat, pas dans le handler : elle doit donc survivre
    // au passage par la base, sinon elle ne protège que le premier appel.
    const day = opened();
    day.close([order()], AT);
    const again = ProductionDay.fromSnapshot(day.toSnapshot());

    expect(() => {
      again.close([order()], AT);
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
