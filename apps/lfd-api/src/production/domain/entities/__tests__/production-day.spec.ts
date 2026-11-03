import {
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
} from "../../errors/production-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";
import { AT, opened, order } from "./production-day-fixtures.js";

/**
 * L'agrégat, éprouvé **sans Nest et sans base** : on instancie, on appelle une
 * méthode métier, on assert — y compris les refus, qui sont sa raison d'être.
 * Le colisage (`-packing-owner`), les auteurs et les retraits (`-authors`),
 * les coches héritées (`-carried-checks`) ont leur spec.
 */

describe("arrêter une journée", () => {
  it("fige les commandes et compte ce qu'il y a à produire", () => {
    const day = opened();

    day.close([order()], new Set<string>(), AT, null);

    expect(day.isClosed).toBe(true);
    expect(day.closedAt).toBe(AT);
    expect(day.orders).toHaveLength(1);
    expect(day.counts).toEqual([
      // `done: null` : une journée qu'on vient d'arrêter n'a rien de sorti du
      // four. Écrit plutôt que laissé deviner — comme `packed` sur la commande.
      { sku: "VIE-001", productName: "Croissant", quantity: 40, saleUnit: "piece", done: null },
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
          lines: [
            {
              sku: "VIE-001",
              productName: "Croissant",
              quantity: 40,
              saleUnit: "piece",
              madeToOrder: null,
            },
          ],
        }),
        order({
          orderId: "ord_2",
          lines: [
            {
              sku: "VIE-001",
              productName: "Croissant",
              quantity: 12,
              saleUnit: "piece",
              madeToOrder: null,
            },
          ],
        }),
      ],
      new Set<string>(),
      AT,
      null,
    );

    expect(day.counts).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 52, saleUnit: "piece", done: null },
    ]);
  });

  it("trie le compte par SKU — deux clôtures identiques rendent le même compte", () => {
    // Le PDF qu'on en tire est archivé, donc son rendu doit être déterministe.
    // Dans l'ordre d'arrivée des commandes, il ne le serait pas.
    const day = opened();

    day.close(
      [
        order({
          lines: [
            {
              sku: "VIE-009",
              productName: "Pain au lait",
              quantity: 5,
              saleUnit: "piece",
              madeToOrder: null,
            },
          ],
        }),
        order({
          orderId: "ord_2",
          lines: [
            {
              sku: "PAI-001",
              productName: "Tradition",
              quantity: 3,
              saleUnit: "piece",
              madeToOrder: null,
            },
          ],
        }),
      ],
      new Set<string>(),
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
    day.close([order()], new Set<string>(), AT, null);

    expect(() => {
      day.close([order(), order({ orderId: "ord_2" })], new Set<string>(), AT, null);
    }).toThrow(ProductionDayAlreadyClosedError);
    expect(day.orders).toHaveLength(1);
  });

  it("REFUSE d'arrêter une journée vide", () => {
    // Fermer le vide écrirait « ce jour-là on a produit ceci » là où il n'y a
    // rien eu — et le zéro passerait pour une mesure.
    expect(() => {
      opened().close([], new Set<string>(), AT, null);
    }).toThrow(ProductionDayEmptyError);
  });
});

describe("le colisage, vu de la journée", () => {
  function closed(): ProductionDay {
    const day = opened();
    day.close(
      [order(), order({ orderId: "ord_2", reference: "ORD-0002" })],
      new Set<string>(),
      AT,
      null,
    );
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
    day.close([order()], new Set<string>(), AT, null);

    const again = ProductionDay.fromSnapshot(day.toSnapshot());

    expect(again.toSnapshot()).toEqual(day.toSnapshot());
    expect(again.isClosed).toBe(true);
  });

  it("une journée relue et CLOSE refuse toujours de se rouvrir", () => {
    // La garde vit dans l'agrégat, pas dans le handler : elle doit donc survivre
    // au passage par la base, sinon elle ne protège que le premier appel.
    const day = opened();
    day.close([order()], new Set<string>(), AT, null);
    const again = ProductionDay.fromSnapshot(day.toSnapshot());

    expect(() => {
      again.close([order()], new Set<string>(), AT, null);
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
