import { ORDER_TERMS } from "../../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type {
  DeliveryNoteOrder,
  DeliveryNoteOrderLine,
} from "../../../../orders/domain/ports/order-lines-for-delivery-note.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import {
  FixedConfirmedOrders,
  InMemoryDeliveryNotes,
  InMemoryShortfallDecisions,
} from "../../__tests__/delivery-note-doubles.js";
import { DeliveryNotePlanner } from "../delivery-note-planner.js";

/** Les instants ne sont comparés qu'entre eux (marqueur d'arrêt), jamais à l'horloge. */
const CLOSED_AT = new Date(0);
const RECLOSED_AT = new Date(60_000);
const NOW = new Date(120_000);

const BREAD: DeliveryNoteOrderLine = {
  sku: "PAIN-001",
  productName: "Pain de campagne",
  unitPriceMillicents: 412_345,
  vatRate: 5.5,
  quantity: 12,
  saleUnit: "piece" as const,
  lineTotalCents: 49_481,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

function orderOf(id: string, number: string, lines = [BREAD]): DeliveryNoteOrder {
  return { orderId: id, orderNumber: number, lines, terms: ORDER_TERMS };
}

function scene() {
  const orders = new FixedConfirmedOrders();
  const notes = new InMemoryDeliveryNotes();
  const planner = new DeliveryNotePlanner(
    orders,
    notes,
    new FixedIdGenerator("dn"),
    new FixedClock(NOW),
    new InMemoryShortfallDecisions(),
  );
  return { orders, notes, planner };
}

describe("DeliveryNotePlanner — le BL prévu à l'arrêt du plan (plan E1)", () => {
  it("prévoit le BL-1 de chaque commande que CET arrêt a confirmée, lignes égales", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1042"), CLOSED_AT);

    await planner.planConfirmed(["ord_1"], CLOSED_AT);

    expect(notes.forOrder("ord_1")).toEqual([
      {
        id: "dn_000001",
        orderId: "ord_1",
        rank: 1,
        number: "BL-1042-1",
        serviceDay: null,
        status: "planned",
        plannedAt: NOW,
        // Le papier (plan E6, § 14) : version 1, jamais imprimé.
        contentVersion: 1,
        printed: null,
        voidedAt: null,
        preparedAt: null,
        handedOverAt: null,
        receivedOn: null,
        lines: [BREAD],
        terms: ORDER_TERMS,
      },
    ]);
  });

  it("une commande de l'instantané que l'arrêt n'a pas confirmée (planWhere) n'a pas de BL", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);

    await planner.planConfirmed(["ord_1", "ord_filtered"], CLOSED_AT);

    expect(notes.forOrder("ord_filtered")).toEqual([]);
    expect(notes.forOrder("ord_1")).toHaveLength(1);
  });

  it("une seconde livraison du même fait ne crée rien de plus", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);

    await planner.planConfirmed(["ord_1"], CLOSED_AT);
    await planner.planConfirmed(["ord_1"], CLOSED_AT);

    expect(notes.forOrder("ord_1")).toHaveLength(1);
  });

  it("une re-clôture après réouverture RÉÉCRIT le BL-1 prévu : même id, même numéro", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);
    await planner.planConfirmed(["ord_1"], CLOSED_AT);
    const revised = { ...BREAD, quantity: 3, lineTotalCents: 12_370 };
    orders.confirm(orderOf("ord_1", "ORD-1", [revised]), RECLOSED_AT);

    await planner.planConfirmed(["ord_1"], RECLOSED_AT);

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({ id: "dn_000001", number: "BL-1-1", lines: [revised] }),
    ]);
  });

  it("une re-clôture après révision recopie les NOUVEAUX totaux dans l'en-tête (plan E4a, § 4)", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);
    await planner.planConfirmed(["ord_1"], CLOSED_AT);
    const revisedTerms = {
      ...ORDER_TERMS,
      subtotalCents: 60_000,
      vatCents: 3_300,
      totalCents: 61_241,
    };
    orders.confirm({ ...orderOf("ord_1", "ORD-1"), terms: revisedTerms }, RECLOSED_AT);

    await planner.planConfirmed(["ord_1"], RECLOSED_AT);

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({ id: "dn_000001", terms: revisedTerms }),
    ]);
  });

  /**
   * Régression : la re-clôture prenait le premier BL `planned` de la
   * commande, et un reliquat prévu passait pour le BL-1 dès que celui-ci
   * était préparé (reliquat, lot L2, 2026-10-26).
   */
  it("une re-clôture ne réécrit jamais un reliquat prévu, même quand le BL-1 est préparé", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);
    await planner.planConfirmed(["ord_1"], CLOSED_AT);
    const [first] = notes.forOrder("ord_1");
    const firstNote = DeliveryNote.rehydrate(first!);
    firstNote.prepare(CLOSED_AT);
    await notes.save(firstNote);
    const remainder = DeliveryNote.planRemainder(
      "dn_rest",
      { ...orderOf("ord_1", "ORD-1"), orderDay: "2030-03-10" },
      2,
      "2030-03-11",
      CLOSED_AT,
    );
    await notes.save(remainder);
    const before = remainder.toState();
    orders.confirm(orderOf("ord_1", "ORD-1", [{ ...BREAD, quantity: 3 }]), RECLOSED_AT);

    await planner.planConfirmed(["ord_1"], RECLOSED_AT);

    expect(notes.forOrder("ord_1").find((note) => note.id === "dn_rest")).toEqual(before);
  });

  it("un BL annulé n'est ni réécrit ni remplacé : son numéro n'est jamais réemployé", async () => {
    const { orders, notes, planner } = scene();
    const voided = DeliveryNote.planFromOrder("dn_old", orderOf("ord_1", "ORD-1"), CLOSED_AT);
    voided.void(CLOSED_AT);
    await notes.save(voided);
    orders.confirm(orderOf("ord_1", "ORD-1"), RECLOSED_AT);
    const before = notes.saves;

    await planner.planConfirmed(["ord_1"], RECLOSED_AT);

    expect(notes.saves).toBe(before);
    expect(notes.forOrder("ord_1")).toEqual([voided.toState()]);
  });

  it("sans commande confirmée, ne lit même pas les BL", async () => {
    const { notes, planner } = scene();

    await planner.planConfirmed(["ord_1"], CLOSED_AT);

    expect(notes.saves).toBe(0);
  });
});

/**
 * Régression (CI de dev, 2026-10-24, `3e99c9a83`) : un numéro de commande sans
 * `ORD-` levait dans l'unité de travail de l'arrêt, qui s'annulait — et les
 * commandes payées restaient `placed`. Un BL qui ne peut pas naître ne bloque
 * jamais la confirmation.
 */
describe("DeliveryNotePlanner — un BL impossible ne bloque pas l'arrêt", () => {
  it("une commande au numéro atypique est sautée sans lever, les autres ont leur BL", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_odd", "CMD-BALAYAGE-1"), CLOSED_AT);
    orders.confirm(orderOf("ord_1", "ORD-1042"), CLOSED_AT);

    await expect(planner.planConfirmed(["ord_odd", "ord_1"], CLOSED_AT)).resolves.toBeUndefined();

    expect(notes.forOrder("ord_odd")).toEqual([]);
    expect(notes.forOrder("ord_1")).toHaveLength(1);
  });

  it("une commande sans ligne ne lève pas non plus", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1042", []), CLOSED_AT);

    await expect(planner.planConfirmed(["ord_1"], CLOSED_AT)).resolves.toBeUndefined();

    expect(notes.forOrder("ord_1")).toEqual([]);
  });
});
