import {
  AtelierSheetNotFoundError,
  ContainerCeilingReachedError,
  InvalidContainerCountError,
  PackedOrderSealedError,
  ProductionDayNotClosedError,
} from "../../errors/production-errors.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { MAX_CONTAINERS_PER_ORDER } from "../../value-objects/container-step.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";

/**
 * **Les containers d'une commande** — les bacs du véhicule, éprouvés sur
 * l'agrégat seul. Un fichier à part du remplissage des lignes : le compte et la
 * coche ne changeront pas pour les mêmes raisons.
 *
 * 🔴 Rien à voir avec `production_container`, le matériel du FOUR réglé par SKU.
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

describe("compter les containers d'une commande", () => {
  function closed(): ProductionDay {
    const day = opened();
    day.close([order(), order({ orderId: "ord_2", reference: "CMD-0002" })], AT);
    return day;
  }

  it("une commande fraîchement inscrite en occupe ZÉRO", () => {
    // Personne ne les a encore comptés — écrit plutôt que laissé deviner.
    expect(closed().orders.every((entry) => entry.containers === 0)).toBe(true);
  });

  it("pose le nombre annoncé, et ne touche pas aux autres commandes", () => {
    const day = closed();

    const counted = day.declareContainers("CMD-0001", 3);

    expect(counted.containers).toBe(3);
    expect(day.orders.find((entry) => entry.reference === "CMD-0002")?.containers).toBe(0);
  });

  it("accepte ZÉRO — c'est une réponse, pas une absence de réponse", () => {
    const day = closed();
    day.declareContainers("CMD-0001", 4);

    expect(day.declareContainers("CMD-0001", 0).containers).toBe(0);
  });

  it("REFUSE un nombre qui n'en est pas un", () => {
    // On ne charge pas deux bacs et demi, ni moins que zéro, ni cent.
    expect(() => closed().declareContainers("CMD-0001", -1)).toThrow(InvalidContainerCountError);
    expect(() => closed().declareContainers("CMD-0001", 2.5)).toThrow(InvalidContainerCountError);
    expect(() => closed().declareContainers("CMD-0001", MAX_CONTAINERS_PER_ORDER + 1)).toThrow(
      InvalidContainerCountError,
    );
  });

  it("REFUSE une journée ouverte et une référence hors du plan", () => {
    expect(() => opened().declareContainers("CMD-0001", 1)).toThrow(ProductionDayNotClosedError);
    expect(() => closed().declareContainers("CMD-9999", 1)).toThrow(AtelierSheetNotFoundError);
  });

  it("🔴 REFUSE une commande dont le bac est FERMÉ", () => {
    // Le nombre de bacs a été annoncé avec le reste ; le corriger après coup
    // ferait mentir ce que le commerce a déjà dit au client, et le chargeur du
    // véhicule compte sur un papier qui ne bouge pas.
    const day = closed();
    day.declareContainers("CMD-0001", 2);
    day.pack("CMD-0001", LATER, "auth0|karim");

    expect(() => day.declareContainers("CMD-0001", 5)).toThrow(PackedOrderSealedError);
    expect(day.orders.find((entry) => entry.reference === "CMD-0001")?.containers).toBe(2);
  });

  it("🔴 un retirage GARDE le compte déjà posé", () => {
    // La journée est effacée puis recréée par `save` : sans ça, un retirage
    // ferait recompter tous les bacs déjà comptés.
    const day = closed();
    day.declareContainers("CMD-0001", 3);

    const absorbed = day.retake(
      [
        order(),
        order({ orderId: "ord_2", reference: "CMD-0002" }),
        order({ orderId: "ord_3", reference: "CMD-0003" }),
      ],
      LATER,
      "auth0|lea",
    );

    expect(absorbed).toBe(1);
    expect(day.orders.find((entry) => entry.reference === "CMD-0001")?.containers).toBe(3);
    // La commande absorbée naît à zéro : ses bacs n'ont pas été comptés.
    expect(day.orders.find((entry) => entry.reference === "CMD-0003")?.containers).toBe(0);
  });
});

describe("un pas de container", () => {
  function closed(): ProductionDay {
    const day = opened();
    day.close([order()], AT);
    return day;
  }

  it("laisse passer un « + » et un « − » sur un bac ouvert, SANS muter", () => {
    // C'est la base qui compte : la garde ne calcule aucun total, sans quoi la
    // course que le pas ferme se rouvrirait ici.
    const day = closed();

    expect(day.containerStepOn("CMD-0001", "add").containers).toBe(0);
    expect(day.containerStepOn("CMD-0001", "remove").containers).toBe(0);
    expect(day.orders[0]?.containers).toBe(0);
  });

  it("laisse passer un « − » à ZÉRO — sans effet, pas un refus", () => {
    // L'écran n'a pas à comparer le compte à zéro pour savoir s'il peut appuyer.
    expect(() => closed().containerStepOn("CMD-0001", "remove")).not.toThrow();
  });

  it("REFUSE un « + » au plafond, et laisse pourtant retirer", () => {
    const day = closed();
    day.declareContainers("CMD-0001", MAX_CONTAINERS_PER_ORDER);

    expect(() => day.containerStepOn("CMD-0001", "add")).toThrow(ContainerCeilingReachedError);
    expect(() => day.containerStepOn("CMD-0001", "remove")).not.toThrow();
  });

  it("porte les refus structurels partagés avec le total", () => {
    expect(() => opened().containerStepOn("CMD-0001", "add")).toThrow(ProductionDayNotClosedError);
    expect(() => closed().containerStepOn("CMD-9999", "add")).toThrow(AtelierSheetNotFoundError);
  });

  it("🔴 REFUSE les deux sens sur une commande déclarée prête", () => {
    const day = closed();
    day.pack("CMD-0001", LATER, "auth0|karim");

    expect(() => day.containerStepOn("CMD-0001", "add")).toThrow(PackedOrderSealedError);
    expect(() => day.containerStepOn("CMD-0001", "remove")).toThrow(PackedOrderSealedError);
  });
});
