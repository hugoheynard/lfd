/**
 * **La facture et le prélèvement lisent les montants facturables** (lot E6c2,
 * plan E6c2 (`documentation/commandes/bon-de-livraison.md`)).
 *
 * Ce que seul le vrai Postgres prouve : chaque lecteur de la comptabilité,
 * devant une commande dont le BL partiel diffère VOLONTAIREMENT du total
 * commandé, rend la valeur facturable ; un bon remis sans solde est nommé, pas
 * tu ; la ligne d'encaissement suit le solde ; le gel refuse de réécrire les
 * montants d'une commande engagée.
 */
import { BillableOrdersReader } from "../src/b2b/accounting/domain/ports/billable-orders.reader.js";
import { CollectionCandidatesReader } from "../src/b2b/accounting/domain/ports/collection-candidates.reader.js";
import { CycleOrdersReader } from "../src/b2b/accounting/domain/ports/cycle-orders.reader.js";
import { InvoiceDossierReader } from "../src/b2b/accounting/domain/ports/invoice-dossier.reader.js";
import { MonthlyInvoicingReader } from "../src/b2b/accounting/domain/ports/monthly-invoicing.reader.js";
import { OrderCollectionRepository } from "../src/b2b/accounting/domain/ports/order-collection.repository.js";
import { ProcedureOrdersReader } from "../src/b2b/accounting/domain/ports/procedure-orders.reader.js";
import { UnconfirmedDeliveriesReader } from "../src/b2b/accounting/domain/ports/unconfirmed-deliveries.reader.js";
import type { E2eContext } from "./e2e-harness.js";
import { receivedColumns } from "./factories.js";
import { handOver } from "./order-factory.js";
import { bootstrapProductionDay, closeOrder, SERVICE_DAY } from "./production-day-fixture.js";
import {
  accountOrder,
  decide,
  report,
  windowAroundServiceDay,
} from "./shortfall-decision-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("la facture lit ce qui est parti (E6c2)", () => {
  it("décidée et remise, elle entre au lot et à la facture sur ce qui est PARTI — lignes du BL, totaux facturables", async () => {
    const order = await accountOrder(ctx, 1);
    await report(ctx, order.id);
    await decide(ctx, order.id);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);
    const [note] = await ctx.prisma.deliveryNote.findMany({ where: { orderId: order.id } });
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const { from, to } = windowAroundServiceDay();

    const candidates = await ctx.app
      .get(CollectionCandidatesReader, { strict: false })
      .collectableOrders(from, to, [order.id]);
    const invoicing = await ctx.app
      .get(MonthlyInvoicingReader, { strict: false })
      .uninvoicedOrders(from, to);
    const invoiced = invoicing.find((one) => one.orderId === order.id);

    // Le BL partiel diffère volontairement du total commandé : c'est lui qui est lu.
    expect(row.billableTotalCents).toBeLessThan(row.totalCents);
    expect(candidates.map((one) => one.totalCents)).toEqual([note?.totalCents]);
    expect(invoiced?.settlement).toBeUndefined();
    expect(invoiced?.frozen.totalCents).toBe(note?.totalCents);
    expect(invoiced?.frozen.vatCents).toBe(note?.vatCents);
    expect(invoiced?.frozen.lines.map((line) => line.quantity)).toEqual([1]);
    expect(invoiced?.deliveryNoteNumbers).toEqual([note?.number]);
  });

  it("relevé, dossier, aperçu, procédure et encaissement lisent le montant facturable ; la ligne `due` suit le solde", async () => {
    const order = await accountOrder(ctx, 1);
    await report(ctx, order.id);
    await decide(ctx, order.id);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    const placed = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    // Une ligne d'encaissement née AVANT le solde, sur le total commandé.
    await ctx.prisma.orderCollection.create({
      data: {
        orderId: order.id,
        state: "due",
        amountCents: placed.totalCents,
        updatedAt: new Date(),
      },
    });
    await handOver(ctx, order);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const billable = row.billableTotalCents;
    const { from, to } = windowAroundServiceDay();
    const companyIds = [row.companyId ?? ""];
    const cycle = { startsAt: from, closesAt: to };
    await ctx.prisma.collectionFloor.upsert({
      where: { id: true },
      create: { id: true, floorAt: from },
      update: { floorAt: from },
    });

    const statement = await ctx.app
      .get(CycleOrdersReader, { strict: false })
      .cycleOrders(companyIds, cycle);
    const dossier = await ctx.app
      .get(InvoiceDossierReader, { strict: false })
      .dossierOrders(companyIds, cycle);
    const preview = await ctx.app
      .get(BillableOrdersReader, { strict: false })
      .billableBetween(from, to);
    const procedure = await ctx.app.get(ProcedureOrdersReader, { strict: false }).ofPeriod({
      periodInvoiceIds: [],
      deliveredFrom: from,
      deliveredTo: to,
      servedFrom: SERVICE_DAY,
      servedThrough: SERVICE_DAY,
      servedBefore: SERVICE_DAY,
    });
    const collection = await ctx.app
      .get(OrderCollectionRepository, { strict: false })
      .load(order.id);

    expect(billable).toBeLessThan(row.totalCents);
    expect(statement.map((one) => one.totalCents)).toEqual([billable]);
    expect(dossier.map((one) => one.order.totalCents)).toEqual([billable]);
    expect(dossier[0]?.order.lines.map((line) => line.quantity)).toEqual([1]);
    expect(preview.map((one) => one.totalCents)).toEqual([billable]);
    expect(procedure.map((one) => one.totalCents)).toEqual([billable]);
    expect(collection?.toPersistence().amountCents).toBe(billable);
  });

  it("remise, son BL encore à remettre : écartée et signalée (en attente du reste), aux bons à constater", async () => {
    const order = await accountOrder(ctx, 3);
    // Une remise sans solde : ce que le rapprochement doit encore reprendre.
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: receivedColumns(new Date(`${SERVICE_DAY}T10:00:00.000Z`)),
    });
    const { from, to } = windowAroundServiceDay();

    const invoicing = await ctx.app
      .get(MonthlyInvoicingReader, { strict: false })
      .uninvoicedOrders(from, to);
    const candidates = await ctx.app
      .get(CollectionCandidatesReader, { strict: false })
      .collectableOrderIds(from, to);
    const unconfirmed = await ctx.app
      .get(UnconfirmedDeliveriesReader, { strict: false })
      .servedBefore("2999-01-01");
    const { totalCents } = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(invoicing.find((one) => one.orderId === order.id)?.settlement).toBe(
      "awaiting_remainder",
    );
    expect(candidates).not.toContain(order.id);
    expect(unconfirmed.find((one) => one.orderId === order.id)).toMatchObject({
      awaitingRemainder: true,
      totalCents,
    });
  });

  it("remise sans solde et sans rien d'attendu : une anomalie, que le bloqueur nommera", async () => {
    const order = await accountOrder(ctx, 3);
    const servedAt = new Date(`${SERVICE_DAY}T10:00:00.000Z`);
    // Le BL remis, la commande remise, et pourtant aucun solde : ce que la
    // réconciliation doit reprendre.
    await ctx.prisma.order.update({ where: { id: order.id }, data: receivedColumns(servedAt) });
    await ctx.prisma.deliveryNote.updateMany({
      where: { orderId: order.id },
      data: { status: "handed_over", preparedAt: servedAt, ...receivedColumns(servedAt) },
    });
    const { from, to } = windowAroundServiceDay();

    const invoicing = await ctx.app
      .get(MonthlyInvoicingReader, { strict: false })
      .uninvoicedOrders(from, to);

    expect(invoicing.find((one) => one.orderId === order.id)?.settlement).toBe("unsettled");
  });

  it("le gel — engagée, ses montants facturables ne se réécrivent plus ; libre, si", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);
    const { billableTotalCents } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    const rewrite = (cents: number | null) =>
      ctx.prisma.$executeRaw`
        UPDATE "public"."orders" SET "billable_total_cents" = ${cents} WHERE "id" = ${order.id}`;

    // Libre : l'ombre reste corrigeable (le rapprochement), retour compris.
    await rewrite((billableTotalCents ?? 0) + 1);
    await rewrite(billableTotalCents);
    // Une ligne `excluded` est LIBRE (une seule définition d'« engagé »,
    // celle d'`engagementFrom`) : la réécriture passe encore.
    await ctx.prisma.orderCollection.create({
      data: {
        orderId: order.id,
        state: "excluded",
        exclusionReason: "payer_detached",
        amountCents: billableTotalCents ?? 0,
        updatedAt: new Date(),
      },
    });
    await rewrite((billableTotalCents ?? 0) + 1);
    await rewrite(billableTotalCents);
    await ctx.prisma.orderCollection.update({
      where: { orderId: order.id },
      data: {
        state: "settled_otherwise",
        exclusionReason: null,
        settledNote: "réglé par virement",
        settledByStaffId: "staff-e2e",
      },
    });

    await expect(rewrite((billableTotalCents ?? 0) + 1)).rejects.toThrow(/engagés/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "public"."orders" SET "settled_on" = NULL WHERE "id" = ${order.id}`,
    ).rejects.toThrow(/engagés/);
  });
});
