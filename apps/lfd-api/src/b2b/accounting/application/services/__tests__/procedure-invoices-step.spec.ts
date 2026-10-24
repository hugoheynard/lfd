import { InvoicingCalendar } from "../../../domain/services/invoicing-calendar.js";
import { defaultModes, paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { frozenOrder } from "../../../domain/services/__tests__/collection-fixtures.js";
import type { InvoiceableOrder } from "../../../domain/services/monthly-invoicing.js";
import type { UnconfirmedDelivery } from "../../../domain/ports/unconfirmed-deliveries.reader.js";
import { invoicesStepWorld } from "./procedure-invoices-doubles.js";

/**
 * Les dates ne sont comparées qu'à l'instant `NOW` donné au service, jamais
 * à l'horloge réelle : elles peuvent rester absolues (CLAUDE.md § 5).
 */
const NOW = new Date("2026-11-03T10:00:00.000Z");
const FLOOR = paris("2026-01-01");
const OCTOBER_CLOSURE = paris("2026-11-01");
const calendar = InvoicingCalendar.of(defaultModes(), []);

function order(orderId: string, companyId: string): InvoiceableOrder {
  const placedAt = paris("2026-10-10", "09:00");
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    companyId,
    placedAt,
    deliveredOn: "2026-10-12",
    billedCompanyId: null,
    frozen: frozenOrder(`ORD-${orderId}`, placedAt),
  };
}

function unconfirmed(orderId: string, serviceDay: string): UnconfirmedDelivery {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    companyId: "c1",
    companyName: "Hôtel du Port",
    serviceDay,
    fulfillmentMethod: "delivery",
    totalCents: 1200,
    placedAt: paris("2026-09-01", "09:00"),
    billedCompanyId: null,
  };
}

function read(
  world: ReturnType<typeof invoicesStepWorld>,
  closesAt: Date | null = OCTOBER_CLOSURE,
) {
  return world.step.read({ legalEntityId: "le1", calendar, closesAt, now: NOW });
}

describe("ProcedureInvoicesStep — l'onglet Factures de la procédure", () => {
  it("un bon de la période sans facture : à faire, compté, lu du plancher à la clôture", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.uninvoiced.orders = [order("1", "c1")];

    const view = await read(world);

    expect(view).toMatchObject({
      state: "to_do",
      reason: "missing_invoices",
      missingOrderCount: 1,
    });
    expect(world.uninvoiced.asked).toEqual([{ from: FLOOR, to: OCTOBER_CLOSURE }]);
    expect(view.closure?.periodClosesAt).toBe(OCTOBER_CLOSURE.toISOString());
  });

  it("tout facturé : fait", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;

    expect(await read(world)).toMatchObject({ state: "done", reason: "all_invoiced" });
  });

  it("les bons à constater sont ceux de LA période : ni avant, ni après sa fin", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.unconfirmed.rows = [
      unconfirmed("sept", "2026-09-30"),
      unconfirmed("oct", "2026-10-20"),
      unconfirmed("nov", "2026-11-02"),
    ];

    const view = await read(world);

    expect(world.unconfirmed.asked).toEqual([{ day: "2026-11-03", from: "2026-10-01" }]);
    expect(view.unconfirmedDeliveries.map((row) => row.orderNumber)).toEqual(["ORD-oct"]);
    expect(view).toMatchObject({ state: "to_do", reason: "unconfirmed_deliveries" });
    expect(Object.keys(view.unconfirmedDeliveries[0] ?? {})).not.toContain("placedAt");
  });

  it("une clôture à venir est verrouillée", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;

    expect(await read(world, paris("2026-12-01"))).toMatchObject({
      state: "locked",
      reason: "not_yet_issuable",
    });
  });

  it("une clôture d'avant la mise en service : rien à facturer, l'assiette n'est pas lue", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = paris("2026-12-01");
    world.uninvoiced.orders = [order("1", "c1")];

    expect(await read(world)).toMatchObject({ state: "done", reason: "before_service" });
    expect(world.uninvoiced.asked).toEqual([]);
  });

  it("sans clôture : rien n'est lu", async () => {
    const world = invoicesStepWorld();

    expect(await read(world, null)).toMatchObject({ reason: "no_closure", closure: null });
    expect(world.unconfirmed.asked).toEqual([]);
  });

  /** Régression : un lot clos hors du calendrier faisait lever `periodOf` (500 sur la lecture). */
  it("une clôture hors du calendrier de facturation : rien à émettre, pas d'erreur", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;

    expect(await read(world, paris("2026-10-15"))).toMatchObject({ reason: "no_closure" });
  });
});
