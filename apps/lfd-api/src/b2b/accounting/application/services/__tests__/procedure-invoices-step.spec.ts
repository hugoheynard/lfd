import type { MonthlyInvoiceView } from "@lfd/contracts";

import { InvoicingCalendar } from "../../../domain/services/invoicing-calendar.js";
import { defaultModes, paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { invoicesStepWorld, procedureRow } from "./procedure-invoices-doubles.js";

/**
 * Les dates ne sont comparées qu'à l'instant `NOW` donné au service, jamais
 * à l'horloge réelle : elles peuvent rester absolues (CLAUDE.md § 5).
 */
const NOW = new Date("2026-11-03T10:00:00.000Z");
const FLOOR = paris("2026-01-01");
const OCTOBER_CLOSURE = paris("2026-11-01");
const calendar = InvoicingCalendar.of(defaultModes(), []);

function invoice(invoiceId: string, number: string): MonthlyInvoiceView {
  return {
    invoiceId,
    number,
    payerCompanyId: "c1",
    payerName: "Hôtel du Port",
    issuedOn: "2026-10-31",
    dueOn: null,
    totalCents: 1200,
    orderCount: 1,
    mandateReference: null,
    unbillableOrders: [],
  };
}

function read(
  world: ReturnType<typeof invoicesStepWorld>,
  closesAt: Date | null = OCTOBER_CLOSURE,
) {
  return world.step.read({ legalEntityId: "le1", calendar, closesAt, now: NOW });
}

describe("ProcedureInvoicesStep — l'onglet Factures de la procédure", () => {
  it("demande la période en une lecture : factures de la clôture, assiette, jours demandés passés", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.invoices.invoices = [invoice("inv1", "FA-LFD-2026-000001")];

    await read(world);

    expect(world.orders.asked).toEqual([
      {
        periodInvoiceIds: ["inv1"],
        deliveredFrom: FLOOR,
        deliveredTo: OCTOBER_CLOSURE,
        servedFrom: "2026-10-01",
        servedThrough: "2026-10-31",
        servedBefore: "2026-11-03",
      },
    ]);
  });

  it("une seule liste, un statut par commande, triée par jour ; les chiffres en sont comptés", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.invoices.invoices = [invoice("inv1", "FA-LFD-2026-000001")];
    world.orders.rows = [
      procedureRow("late", { serviceDay: "2026-10-20", handedOver: false, receivedOn: null }),
      procedureRow("billed", {
        serviceDay: "2026-10-05",
        invoice: { invoiceId: "inv1", number: "FA-LFD-2026-000001" },
      }),
      procedureRow("given", { serviceDay: "2026-10-12" }),
    ];

    const view = await read(world);

    expect(view.orders.map((o) => [o.orderNumber, o.status, o.invoiceNumber])).toEqual([
      ["ORD-billed", "invoiced", "FA-LFD-2026-000001"],
      ["ORD-given", "receipt_confirmed", null],
      ["ORD-late", "receipt_to_confirm", null],
    ]);
    expect(view.figures).toEqual({ invoiced: 1, receiptConfirmed: 1, receiptToConfirm: 1 });
    expect(view.issuableCount).toBe(1);
    expect(view).toMatchObject({ state: "to_do", reason: "receipts_to_confirm" });
  });

  /** Régression (dev, 2026-10-24) : une commande remise et facturée avant ZL, sans `received_on`, était « à constater ». */
  it("facturée avant la règle ZL, sans jour de réception, facture d'une autre période : facturée", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.orders.rows = [
      procedureRow("old", {
        receivedOn: null,
        invoice: { invoiceId: "inv0", number: "FA-LFD-2026-000000" },
      }),
    ];

    const view = await read(world);

    expect(view.orders.map((o) => o.status)).toEqual(["invoiced"]);
    expect(view).toMatchObject({ state: "done", reason: "all_invoiced", issuableCount: 0 });
  });

  it("une commande livrée et facturée dans une période passée ne revient pas", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.orders.rows = [
      procedureRow("sept", {
        receivedOn: "2026-09-12",
        invoice: { invoiceId: "inv-sept", number: "FA-LFD-2026-000009" },
      }),
    ];

    expect((await read(world)).orders).toEqual([]);
  });

  it("remise sans jour de réception : confirmée, nommée à reprendre, hors du bouton — l'onglet reste à faire", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.orders.rows = [procedureRow("noday", { receivedOn: null })];

    const view = await read(world);

    expect(view.orders[0]).toMatchObject({
      status: "receipt_confirmed",
      deliveryDayMissing: true,
    });
    expect(view).toMatchObject({ state: "to_do", reason: "receipts_to_invoice", issuableCount: 0 });
  });

  it("un payeur qui ne clôt pas ici est écarté, sauf si une facture de la clôture le porte", async () => {
    const weeklyClosure = paris("2026-10-26");
    const mixed = InvoicingCalendar.of(defaultModes(), [
      {
        payerCompanyId: "c_week",
        segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" as const }],
      },
    ]);
    // Le lundi 26 clôt l'hebdomadaire, pas le mensuel de `c1`.
    expect(mixed.closesFor("c1", weeklyClosure)).toBe(false);
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.invoices.invoices = [invoice("inv1", "FA-LFD-2026-000001")];
    world.orders.rows = [
      procedureRow("monthly"),
      procedureRow("carried", { invoice: { invoiceId: "inv1", number: "FA-LFD-2026-000001" } }),
    ];

    const view = await world.step.read({
      legalEntityId: "le1",
      calendar: mixed,
      closesAt: weeklyClosure,
      now: NOW,
    });

    expect(view.orders.map((o) => o.orderNumber)).toEqual(["ORD-carried"]);
  });

  it("une clôture à venir est verrouillée, et sa liste se lit déjà", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;
    world.orders.rows = [procedureRow("1", { handedOver: false, receivedOn: null })];

    const view = await read(world, paris("2026-12-01"));

    expect(view).toMatchObject({ state: "locked", reason: "not_yet_issuable" });
    expect(view.figures.receiptToConfirm).toBe(1);
  });

  it("une clôture d'avant la mise en service : rien à facturer, les commandes ne sont pas lues", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = paris("2026-12-01");

    expect(await read(world)).toMatchObject({ state: "done", reason: "before_service" });
    expect(world.orders.asked).toEqual([]);
  });

  it("sans clôture : rien n'est lu", async () => {
    const world = invoicesStepWorld();

    expect(await read(world, null)).toMatchObject({ reason: "no_closure", closure: null });
    expect(world.orders.asked).toEqual([]);
  });

  /** Régression : un lot clos hors du calendrier faisait lever `periodOf` (500 sur la lecture). */
  it("une clôture hors du calendrier de facturation : rien à émettre, pas d'erreur", async () => {
    const world = invoicesStepWorld();
    world.invoices.floorAt = FLOOR;

    expect(await read(world, paris("2026-10-15"))).toMatchObject({ reason: "no_closure" });
  });
});
