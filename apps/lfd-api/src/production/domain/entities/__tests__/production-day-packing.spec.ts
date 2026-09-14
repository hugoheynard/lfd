import {
  AtelierSheetNotFoundError,
  LineNotProducedYetError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
  ProductionDayNotClosedError,
} from "../../errors/production-errors.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";

/**
 * **Le remplissage des bacs**, éprouvé sur l'agrégat seul — sans Nest, sans
 * base. Un fichier à part de `production-day.spec.ts` : le colisage d'une ligne
 * et le cycle de la journée ne changeront pas pour les mêmes raisons.
 *
 * Aucune de ces dates n'est comparée à l'horloge : elles ne sont que recopiées
 * et comparées entre elles.
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

describe("mettre une ligne au bac", () => {
  function closed(): ProductionDay {
    const day = opened();
    day.close([order(), order({ orderId: "ord_2", reference: "CMD-0002" })], AT);
    return day;
  }

  it("rend la ligne du bon demandé, sans rien muter", () => {
    const day = closed();

    const line = day.lineToPack("CMD-0001", "VIE-001");

    expect(line).toEqual({
      sku: "VIE-001",
      productName: "Croissant",
      quantity: 40,
      packed: null,
    });
    expect(day.toSnapshot()).toEqual(closed().toSnapshot());
  });

  it("une journée fraîchement arrêtée n'a AUCUNE ligne au bac", () => {
    // Écrit plutôt que deviné, comme le `packed` de la commande : un champ
    // absent passerait pour une ligne déjà rangée.
    expect(closed().orders.every((o) => o.lines.every((l) => l.packed === null))).toBe(true);
  });

  it("REFUSE une journée qui n'est pas arrêtée", () => {
    // Un bac se remplit à partir d'un bon FIGÉ : sans clôture, il n'y a pas de
    // bon, et cocher écrirait sur une journée qui n'existe pas encore.
    expect(() => opened().lineToPack("CMD-0001", "VIE-001")).toThrow(ProductionDayNotClosedError);
  });

  it("REFUSE une référence qui n'est pas dans cette journée", () => {
    expect(() => closed().lineToPack("CMD-9999", "VIE-001")).toThrow(AtelierSheetNotFoundError);
  });

  it("REFUSE un SKU qui n'est pas sur CE bon", () => {
    // Le poste coche une ligne de commande, pas un article du four : un SKU au
    // compte du jour n'est pas pour autant sur le bon qu'on tient.
    expect(() => closed().lineToPack("CMD-0001", "PAI-001")).toThrow(PackingLineNotFoundError);
  });

  it("🔴 REFUSE toute ligne d'un bac FERMÉ", () => {
    // La fermeture est le fait irréversible : le commerce en a tiré « prête
    // pour le client ». Modifier le contenu après coup ferait mentir l'annonce,
    // et c'est vrai pour les DEUX gestes — cocher comme décocher passent ici.
    const day = closed();
    day.pack("CMD-0001", LATER, "auth0|karim");

    expect(() => day.lineToPack("CMD-0001", "VIE-001")).toThrow(PackedOrderSealedError);
    // L'autre bac, lui, reste ouvert : fermer l'un ne dit rien de l'autre.
    expect(day.lineToPack("CMD-0002", "VIE-001").sku).toBe("VIE-001");
  });

  it("🔴 un retirage n'efface PAS une ligne déjà mise au bac", () => {
    // Même esprit que les coches du compte à produire : le croissant rangé à
    // 6 h l'est toujours quand une commande de plus arrive. Le perdre ferait
    // revider un bac que le fournil vient de remplir.
    const day = closed();
    const filled = ProductionDay.fromSnapshot({
      ...day.toSnapshot(),
      orders: day.toSnapshot().orders.map((entry) =>
        entry.reference === "CMD-0001"
          ? {
              ...entry,
              lines: entry.lines.map((line) => ({
                ...line,
                packed: { at: LATER, by: "auth0|karim", initials: "MB" },
              })),
            }
          : entry,
      ),
    });

    const absorbed = filled.retake(
      [
        order(),
        order({ orderId: "ord_2", reference: "CMD-0002" }),
        order({ orderId: "ord_3", reference: "CMD-0003" }),
      ],
      LATER,
      "auth0|lea",
    );

    expect(absorbed).toBe(1);
    expect(filled.lineToPack("CMD-0001", "VIE-001").packed).toEqual({
      at: LATER,
      by: "auth0|karim",
      initials: "MB",
    });
    // La commande absorbée, elle, naît vide : rien n'a encore été rangé dedans.
    expect(filled.lineToPack("CMD-0003", "VIE-001").packed).toBeNull();
  });
});

describe("l'article pas encore sorti du four", () => {
  function closed(): ProductionDay {
    const day = opened();
    day.close([order()], AT);
    return day;
  }

  /** La même journée, mais le compte à produire est coché. */
  function produced(): ProductionDay {
    const snapshot = closed().toSnapshot();
    return ProductionDay.fromSnapshot({
      ...snapshot,
      counts: snapshot.counts.map((item) => ({
        ...item,
        done: { at: LATER, by: "auth0|karim", initials: "KA" },
      })),
    });
  }

  it("🔴 REFUSE de mettre au bac ce que le four n'a pas sorti", () => {
    // La balance compterait comme réparti ce qui n'existe pas, et le reste
    // affiché serait faux dans le seul sens qui coûte — optimiste.
    expect(() => closed().lineToFill("CMD-0001", "VIE-001")).toThrow(LineNotProducedYetError);
  });

  it("laisse passer une fois la ligne cochée sur la fiche d'atelier", () => {
    expect(produced().lineToFill("CMD-0001", "VIE-001").sku).toBe("VIE-001");
  });

  it("laisse RESSORTIR du bac une ligne redevenue en attente", () => {
    // Refuser les deux sens enfermerait l'exploitant avec un bac qu'il ne peut
    // ni compléter ni corriger : `lineToPack` ne porte pas cette garde.
    expect(closed().lineToPack("CMD-0001", "VIE-001").sku).toBe("VIE-001");
  });

  it("tient pour EN ATTENTE un SKU absent du compte à produire", () => {
    // Arrivé après le tirage : personne ne l'a fabriqué ni même pu le cocher.
    expect(produced().isAwaitingProduction("PAI-001")).toBe(true);
  });

  it("garde les refus structurels devant celui du four", () => {
    // L'ordre compte : « ce bon n'existe pas » est plus utile que « ce produit
    // n'est pas sorti », quand les deux sont vrais.
    expect(() => closed().lineToFill("CMD-9999", "VIE-001")).toThrow(AtelierSheetNotFoundError);
    expect(() => closed().lineToFill("CMD-0001", "PAI-001")).toThrow(PackingLineNotFoundError);
  });
});
