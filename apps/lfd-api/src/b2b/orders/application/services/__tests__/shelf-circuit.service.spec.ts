import { millicentsFromCents } from "@lfd/money";

import { RecordingShelfStockLock } from "../../../../resupply/application/__tests__/shelf-stock-doubles.js";
import { Order, type DraftOrderInput } from "../../../domain/entities/order.js";
import { SameDayOrderClosedError } from "../../../domain/errors/same-day-order-closed.error.js";
import {
  NoPickupLeftTodayError,
  ShelfStockShortError,
} from "../../../domain/errors/shelf-circuit-errors.js";
import type { OrderSupplyDecision } from "../../../domain/value-objects/order-supply.js";
import {
  FixedClosedPlans,
  FixedSameDay,
  gateOf,
  RecordingAdmissionDesk,
} from "../../commands/__tests__/plan-doubles.js";
import type { OrderParties } from "../order-parties.js";
import {
  FixedShelfStock,
  FixedSiteDays,
  shelfCircuitOf,
  siteDay,
} from "./shelf-circuit-doubles.js";

/**
 * Le circuit du jour J à la passation (plan `plan-jour-meme-sur-stock.md`,
 * §11.1, §11.2, §12, lot L4). La porte du plan de `gateOf` est le 1er janvier
 * 2026 à midi, Paris : « aujourd'hui » y vaut `TODAY`, et les jours ci-dessous
 * ne sont comparés qu'à cette horloge figée (exception étroite du CLAUDE.md §5).
 */

const TODAY = "2026-01-01";
const TOMORROW = "2026-01-02";
const SITE = "site_village";

const CLIENT: OrderParties = {
  companyId: null,
  placedByUserId: "usr_1",
  placedByStaffId: null,
  buyerKind: "registered",
};
const PRO: OrderParties = { ...CLIENT, companyId: "co_1" };
const STAFF: OrderParties = { ...PRO, placedByStaffId: "staff_1" };

const SHELF_TODAY: OrderSupplyDecision = { supply: "shelf", today: TODAY, entryShortcut: null };

describe("ShelfCircuit.decide — le serveur décide la marque", () => {
  it("un client, aujourd'hui, plan arrêté : sur la vitrine", async () => {
    const circuit = shelfCircuitOf(gateOf(new FixedClosedPlans([TODAY])));

    expect(await circuit.decide(CLIENT, TODAY, undefined)).toEqual(SHELF_TODAY);
  });

  it("un client, aujourd'hui, plan ouvert (pas encore arrêté, ou rouvert) : fabriquée", async () => {
    const circuit = shelfCircuitOf(gateOf(new FixedClosedPlans()));

    expect(await circuit.decide(CLIENT, TODAY, undefined)).toEqual({ supply: "planned" });
  });

  it("un client ne choisit pas la marque : `shelf` demandé pour demain reste fabriqué", async () => {
    const plans = new FixedClosedPlans([TODAY, TOMORROW]);
    const circuit = shelfCircuitOf(gateOf(plans));

    expect(await circuit.decide(PRO, TOMORROW, "shelf")).toEqual({ supply: "planned" });
    expect(plans.asked).toEqual([]);
  });

  it("l'équipe : ce que l'écran envoie, fabriquée par défaut, sans lire le plan", async () => {
    const plans = new FixedClosedPlans([TODAY]);
    const circuit = shelfCircuitOf(gateOf(plans));

    expect(await circuit.decide(STAFF, TODAY, "shelf")).toEqual(SHELF_TODAY);
    expect(await circuit.decide(STAFF, TODAY, undefined)).toEqual({ supply: "planned" });
    expect(plans.asked).toEqual([]);
  });
});

describe("ShelfCircuit.ensureOpen — clientèle et créneaux restants", () => {
  // Midi à Paris : un créneau à 14:00 reste, celui de 11:00 est passé.
  const AFTERNOON = siteDay({
    label: "Village",
    publicRules: [{ start: "14:00", end: "15:00", slotMinutes: 60 }],
  });
  const MORNING_ONLY = siteDay({
    label: "Village",
    publicRules: [{ start: "11:00", end: "12:00", slotMinutes: 60 }],
  });

  it("refuse la clientèle que le réglage n'ouvre pas", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayProAllowed: true }),
      sites: new FixedSiteDays(new Map([[SITE, AFTERNOON]])),
    });

    await expect(circuit.ensureOpen(CLIENT, SITE)).rejects.toBeInstanceOf(SameDayOrderClosedError);
  });

  it("laisse passer un particulier tant que son point a un créneau après maintenant", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayPublicAllowed: true }),
      sites: new FixedSiteDays(new Map([[SITE, AFTERNOON]])),
    });

    await expect(circuit.ensureOpen(CLIENT, SITE)).resolves.toBeUndefined();
  });

  it("refuse quand le dernier créneau du jour est passé, en nommant le point", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayPublicAllowed: true }),
      sites: new FixedSiteDays(new Map([[SITE, MORNING_ONLY]])),
    });

    await expect(circuit.ensureOpen(CLIENT, SITE)).rejects.toMatchObject({
      code: "orders.shelf.no_pickup_left",
      siteLabel: "Village",
    });
  });

  it("le pro en ligne suit la fenêtre pro du point, pas les créneaux publics", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayProAllowed: true, sameDayProOnline: true }),
      sites: new FixedSiteDays(new Map([[SITE, AFTERNOON]])),
    });

    await expect(circuit.ensureOpen(PRO, SITE)).rejects.toBeInstanceOf(NoPickupLeftTodayError);
  });

  it("le comptoir n'a pas de garde de créneau", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayProAllowed: true }),
    });

    await expect(circuit.ensureOpen(STAFF, null)).resolves.toBeUndefined();
  });
});

function shelfOrder(quantity: number, supply: OrderSupplyDecision = SHELF_TODAY): Order {
  const input: DraftOrderInput = {
    companyId: "co_1",
    billedCompanyId: "co_1",
    principal: null,
    placedByUserId: "usr_1",
    placedByStaffId: "staff_1",
    buyerKind: "registered",
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: {
        label: "Village",
        ligne1: "1 place du Village",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        siteId: SITE,
      },
    },
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    requestedDeliveryDate: new Date(`${TODAY}T00:00:00.000Z`),
    note: "",
    catalogVersionId: null,
    lines: [
      {
        sku: "VIE-001-1",
        productName: "Croissant",
        unitPriceMillicents: millicentsFromCents(120),
        vatRate: 5.5,
        saleUnit: "piece",
        quantity,
      },
    ],
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
  };
  const order = Order.draft(input, supply);
  order.deferPayment();
  return order;
}

const CROISSANTS = (left: number) => [
  {
    sku: "VIE-001-1",
    label: "Croissant",
    saleUnit: "piece" as const,
    receivedQuantity: 10,
    estimatedStock: left,
  },
];

describe("ShelfCircuit.hold — le reste sous le verrou du stock", () => {
  it("prend le verrou de la vitrine du point AVANT de lire le reste, et laisse passer", async () => {
    const lock = new RecordingShelfStockLock();
    const stock = new FixedShelfStock().set(TODAY, SITE, CROISSANTS(3));
    const circuit = shelfCircuitOf(gateOf(), { lock, stock });

    expect(await circuit.hold(shelfOrder(3))).toBe(true);
    expect(lock.taken).toEqual([`${TODAY}:${SITE}`]);
    expect(stock.read).toEqual([`${TODAY}:${SITE}`]);
  });

  it("refuse ce que le reste ne couvre plus — la seconde de deux passations", async () => {
    const stock = new FixedShelfStock().set(TODAY, SITE, CROISSANTS(1));
    const circuit = shelfCircuitOf(gateOf(), { stock });

    await expect(circuit.hold(shelfOrder(2))).rejects.toBeInstanceOf(ShelfStockShortError);
  });

  /** Les deux verrous ne sont jamais tenus ensemble (§11.2). */
  it("une commande fabriquée ne prend pas le verrou du stock, et ne lit rien", async () => {
    const lock = new RecordingShelfStockLock();
    const stock = new FixedShelfStock();
    const desk = new RecordingAdmissionDesk();
    const circuit = shelfCircuitOf(gateOf(new FixedClosedPlans(), desk), { lock, stock });

    expect(await circuit.hold(shelfOrder(3, { supply: "planned" }))).toBe(false);
    expect(lock.taken).toEqual([]);
    expect(stock.read).toEqual([]);
    expect(desk.held).toEqual([]);
  });
});

describe("ShelfCircuit.refusesWithoutCredit — le pro sans crédit (Q7)", () => {
  it("suit le réglage", async () => {
    const refuse = shelfCircuitOf(gateOf(), { sameDay: new FixedSameDay(true) });
    const link = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayProWithoutCredit: "payment_link" }),
    });

    expect(await refuse.refusesWithoutCredit()).toBe(true);
    expect(await link.refusesWithoutCredit()).toBe(false);
  });
});
