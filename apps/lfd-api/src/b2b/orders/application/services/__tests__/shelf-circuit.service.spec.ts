import { millicentsFromCents } from "@lfd/money";

import { EntryShortcutOffShelfError } from "../../../domain/errors/shelf-order-errors.js";
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
  GATE_NOW,
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

  it("l'équipe : le « Retrait immédiat » se garde sur la commande sur stock (lot L6)", async () => {
    const circuit = shelfCircuitOf(gateOf(new FixedClosedPlans([TODAY])));

    expect(await circuit.decide(STAFF, TODAY, "shelf", "immediate_pickup")).toEqual({
      ...SHELF_TODAY,
      entryShortcut: "immediate_pickup",
    });
  });

  it("l'équipe : un « Retrait immédiat » sur une commande programmée est refusé, pas oublié", async () => {
    const circuit = shelfCircuitOf(gateOf(new FixedClosedPlans([TODAY])));

    await expect(
      circuit.decide(STAFF, TODAY, "planned", "immediate_pickup"),
    ).rejects.toBeInstanceOf(EntryShortcutOffShelfError);
    await expect(
      circuit.decide(STAFF, TODAY, undefined, "immediate_pickup"),
    ).rejects.toBeInstanceOf(EntryShortcutOffShelfError);
  });

  it("un client ne pose jamais le raccourci, même s'il l'envoie", async () => {
    const circuit = shelfCircuitOf(gateOf(new FixedClosedPlans([TODAY])));

    expect(await circuit.decide(CLIENT, TODAY, "shelf", "immediate_pickup")).toEqual(SHELF_TODAY);
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

function shelfOrder(
  quantity: number,
  supply: OrderSupplyDecision = SHELF_TODAY,
  siteId: string | null = SITE,
): Order {
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
        ...(siteId === null ? {} : { siteId }),
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

describe("ShelfCircuit.ensureOpen — chaque porte × chaque réglage", () => {
  const AFTERNOON = siteDay({
    label: "Village",
    publicRules: [{ start: "14:00", end: "15:00", slotMinutes: 60 }],
    proPickup: { start: "06:00", end: "18:00" },
  });
  const sites = () => new FixedSiteDays(new Map([[SITE, AFTERNOON]]));

  it("les particuliers ouverts seuls : le pro et le comptoir sont refusés", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayPublicAllowed: true }),
      sites: sites(),
    });
    await expect(circuit.ensureOpen(CLIENT, SITE)).resolves.toBeUndefined();
    await expect(circuit.ensureOpen(PRO, SITE)).rejects.toBeInstanceOf(SameDayOrderClosedError);
    await expect(circuit.ensureOpen(STAFF, SITE)).rejects.toBeInstanceOf(SameDayOrderClosedError);
  });

  it("« pros » sans « en ligne » : le comptoir passe, le pro en ligne est refusé", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayProAllowed: true }),
      sites: sites(),
    });
    await expect(circuit.ensureOpen(STAFF, SITE)).resolves.toBeUndefined();
    await expect(circuit.ensureOpen(PRO, SITE)).rejects.toBeInstanceOf(SameDayOrderClosedError);
  });

  it("« pros » et « en ligne » : le pro en ligne passe dans sa fenêtre", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayProAllowed: true, sameDayProOnline: true }),
      sites: sites(),
    });
    await expect(circuit.ensureOpen(PRO, SITE)).resolves.toBeUndefined();
  });

  it("le comptoir fermé par le réglage est refusé même sans site", async () => {
    const circuit = shelfCircuitOf(gateOf(), { sameDay: new FixedSameDay(false) });
    await expect(circuit.ensureOpen(STAFF, null)).rejects.toBeInstanceOf(SameDayOrderClosedError);
  });

  it("un particulier sans site, ou sur un site inconnu, est refusé sans libellé inventé", async () => {
    const circuit = shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayPublicAllowed: true }),
      sites: sites(),
    });
    await expect(circuit.ensureOpen(CLIENT, null)).rejects.toMatchObject({ siteLabel: null });
    await expect(circuit.ensureOpen(CLIENT, "site_inconnu")).rejects.toMatchObject({
      siteLabel: null,
    });
  });
});

describe("ShelfCircuit.ensureOpen — le dernier créneau, à la minute", () => {
  // Midi à Paris = 11:00Z. Le créneau de 14:00 est le seul du jour.
  const LAST = siteDay({
    label: "Village",
    publicRules: [{ start: "14:00", end: "15:00", slotMinutes: 60 }],
  });
  const at = (minutesAfterNoon: number) => new Date(GATE_NOW.getTime() + minutesAfterNoon * 60_000);
  const circuitAt = (minutesAfterNoon: number, site = LAST) =>
    shelfCircuitOf(gateOf(), {
      sameDay: new FixedSameDay({ sameDayPublicAllowed: true }),
      sites: new FixedSiteDays(new Map([[SITE, site]])),
      now: at(minutesAfterNoon),
    });

  it("à 13:59 le créneau de 14:00 sert encore ; à 14:00 pile, plus", async () => {
    await expect(circuitAt(119).ensureOpen(CLIENT, SITE)).resolves.toBeUndefined();
    await expect(circuitAt(120).ensureOpen(CLIENT, SITE)).rejects.toBeInstanceOf(
      NoPickupLeftTodayError,
    );
  });

  // Fermeture exceptionnelle sur le seul créneau restant : le point ne sert plus.
  it("une fermeture exceptionnelle qui couvre le dernier créneau refuse le particulier", async () => {
    const closed = siteDay({
      label: "Village",
      publicRules: [{ start: "14:00", end: "15:00", slotMinutes: 60 }],
      publicClosures: [{ start: "13:00", end: "16:00" }],
    });
    await expect(circuitAt(0, closed).ensureOpen(CLIENT, SITE)).rejects.toBeInstanceOf(
      NoPickupLeftTodayError,
    );
  });

  it("la fermeture d'une journée entière refuse aussi le particulier", async () => {
    const closed = siteDay({
      label: "Village",
      publicRules: [{ start: "14:00", end: "15:00", slotMinutes: 60 }],
      publicClosures: [{ start: null, end: null }],
    });
    await expect(circuitAt(0, closed).ensureOpen(CLIENT, SITE)).rejects.toBeInstanceOf(
      NoPickupLeftTodayError,
    );
  });
});

describe("ShelfCircuit.hold — frontières du reste et du site", () => {
  it("le dernier article passe : demande == reste", async () => {
    const stock = new FixedShelfStock().set(TODAY, SITE, CROISSANTS(2));
    await expect(shelfCircuitOf(gateOf(), { stock }).hold(shelfOrder(2))).resolves.toBe(true);
  });

  it("un article absent du stock du jour est refusé (panier mixte), le verrou pris avant", async () => {
    const lock = new RecordingShelfStockLock();
    const stock = new FixedShelfStock().set(TODAY, SITE, []);
    const circuit = shelfCircuitOf(gateOf(), { lock, stock });
    await expect(circuit.hold(shelfOrder(1))).rejects.toBeInstanceOf(ShelfStockShortError);
    expect(lock.taken).toEqual([`${TODAY}:${SITE}`]);
  });

  it("le reste d'un AUTRE point ne couvre pas celui-ci", async () => {
    const stock = new FixedShelfStock().set(TODAY, "autre_site", CROISSANTS(50));
    await expect(shelfCircuitOf(gateOf(), { stock }).hold(shelfOrder(1))).rejects.toBeInstanceOf(
      ShelfStockShortError,
    );
  });
});

describe("ShelfCircuit.holdRevision — verrou, hausses, site", () => {
  const claim = (quantity: number, siteId: string | null = SITE) => ({
    serviceDay: TODAY,
    siteId,
    lines: [{ sku: "VIE-001-1", productName: "Croissant", saleUnit: "piece" as const, quantity }],
  });

  it("prend le verrou du point, puis ne juge que la hausse (égale au reste : passe)", async () => {
    const lock = new RecordingShelfStockLock();
    const stock = new FixedShelfStock().set(TODAY, SITE, CROISSANTS(2));
    const circuit = shelfCircuitOf(gateOf(), { lock, stock });
    await expect(circuit.holdRevision(claim(5), claim(7))).resolves.toBeUndefined();
    expect(lock.taken).toEqual([`${TODAY}:${SITE}`]);
  });

  it("une hausse d'une pièce au-delà du reste est refusée", async () => {
    const stock = new FixedShelfStock().set(TODAY, SITE, CROISSANTS(2));
    await expect(
      shelfCircuitOf(gateOf(), { stock }).holdRevision(claim(5), claim(8)),
    ).rejects.toBeInstanceOf(ShelfStockShortError);
  });

  it("une baisse passe vitrine vide", async () => {
    const stock = new FixedShelfStock().set(TODAY, SITE, CROISSANTS(0));
    await expect(
      shelfCircuitOf(gateOf(), { stock }).holdRevision(claim(5), claim(1)),
    ).resolves.toBeUndefined();
  });

  it("sans site à décompter : refus, et aucun verrou pris", async () => {
    const lock = new RecordingShelfStockLock();
    await expect(
      shelfCircuitOf(gateOf(), { lock }).holdRevision(claim(1, null), claim(2, null)),
    ).rejects.toBeInstanceOf(NoPickupLeftTodayError);
    expect(lock.taken).toEqual([]);
  });
});

describe("ShelfCircuit.hold — une commande sur stock sans site", () => {
  it("refuse sans prendre de verrou, jamais un reste inventé", async () => {
    const lock = new RecordingShelfStockLock();
    const order = shelfOrder(1, SHELF_TODAY, null);
    await expect(shelfCircuitOf(gateOf(), { lock }).hold(order)).rejects.toBeInstanceOf(
      NoPickupLeftTodayError,
    );
    expect(lock.taken).toEqual([]);
  });
});
