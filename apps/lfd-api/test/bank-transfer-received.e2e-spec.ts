/**
 * E2E du **virement reçu** et des **impayés au virement** (plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, V7,
 * V8, C7).
 *
 * Ce que seul le vrai serveur prouve : la facture d'une période au virement
 * se règle par le geste « virement reçu » — ses bons passent
 * `settled_by_transfer` dans la même transaction que le virement, le lot ne la
 * prélève jamais, « Mes factures » la dit réglée ; un écart est refusé en
 * euros ; la même clé rejouée n'écrit rien ; une autre clé est refusée en
 * nommant la facture ; une facture au prélèvement est refusée. Le retard
 * se lit après l'échéance.
 *
 * ⚠️ Le segment « au virement depuis le début du mois » est écrit par Prisma,
 * comme dans `collection-means-invoices.e2e-spec.ts` : la route date un
 * changement d'un payeur qui a commandé à sa PROCHAINE clôture. Aucune date
 * absolue : le mois est le précédent du jour du test, l'échéance est relue
 * sur la facture émise.
 */
import type {
  MyIssuedInvoicesView,
  RecordedBankTransferView,
  UnpaidTransferInvoicesView,
} from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import {
  clock,
  closesAt,
  COLLECTION,
  ctx,
  DAY_MS,
  HOUR_MS,
  invoicedPayer,
  month,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";

useCollectionReturnScene();

const ENTITIES = "/admin/accounting/legal-entities";
const UNPAID = "/admin/accounting/transfer-invoices/unpaid";
const FIRST_KEY = "0b6f7f0e-2f53-4f0e-9a51-6c1f6f0b0001";
const SECOND_KEY = "0b6f7f0e-2f53-4f0e-9a51-6c1f6f0b0002";

async function transferSinceMonthStart(entityId: string, payerId: string): Promise<void> {
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.payerCollectionMeans.create({
    data: {
      id: `means_${payerId}`,
      legalEntityId: entityId,
      payerCompanyId: payerId,
      effectiveFrom: startsAt,
      means: "bank_transfer",
      reason: "Le client règle par virement, à sa demande écrite",
      createdAt: startsAt,
      createdByStaffId: "staff-e2e",
    },
  });
}

/** Une entité, un payeur au virement, sa facture du mois émise. */
async function transferInvoice(): Promise<{
  readonly entityId: string;
  readonly payer: string;
  readonly invoice: {
    readonly id: string;
    readonly number: string;
    readonly totalTtcCents: number;
    readonly dueOn: Date;
  };
}> {
  const entityId = await setUpEntity(staff);
  const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
  await transferSinceMonthStart(entityId, payer);
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  const row = await ctx.prisma.invoice.findFirstOrThrow({ where: { payerCompanyId: payer } });
  if (row.dueOn === null) {
    throw new Error("e2e : la facture au virement n'a pas d'échéance");
  }
  return {
    entityId,
    payer,
    invoice: { id: row.id, number: row.number, totalTtcCents: row.totalTtcCents, dueOn: row.dueOn },
  };
}

/** Le jour de Paris de l'horloge du test. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(clock.now());
}

function record(entityId: string, body: object, key: string) {
  return staff()
    .post(`${ENTITIES}/${entityId}/bank-transfers`)
    .set("Idempotency-Key", key)
    .send(body);
}

describe("« virement reçu » (V7)", () => {
  it("règle la facture : bons settled_by_transfer, virement gardé et journalisé, jamais prélevée", async () => {
    const { entityId, payer, invoice } = await transferInvoice();
    const body = {
      amountCents: invoice.totalTtcCents,
      receivedOn: today(),
      reference: invoice.number,
      invoiceIds: [invoice.id],
    };

    const first = jsonBody<RecordedBankTransferView>(
      await record(entityId, body, FIRST_KEY).expect(201),
    );
    const replay = jsonBody<RecordedBankTransferView>(
      await record(entityId, body, FIRST_KEY).expect(201),
    );

    expect(replay.transferId).toBe(first.transferId);
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(1);
    const links = await ctx.prisma.receivedBankTransferInvoice.findMany();
    expect(links).toEqual([
      { transferId: first.transferId, invoiceId: invoice.id, amountCents: invoice.totalTtcCents },
    ]);
    const orders = await ctx.prisma.invoiceOrder.findMany({ where: { invoiceId: invoice.id } });
    const states = await ctx.prisma.orderCollection.findMany();
    expect(states.map((state) => [state.orderId, state.state, state.bankTransferId])).toEqual(
      orders.map((order) => [order.orderId, "settled_by_transfer", first.transferId]),
    );
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "bank_transfer.received", subjectId: payer },
    });
    expect(facts).toHaveLength(1);

    // Le lot du 1er : rien à prélever.
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(409);
    expect(await ctx.prisma.collectionBatchLine.count()).toBe(0);
  });

  it("ressaisi avec une autre clé : 409 qui nomme la facture déjà réglée", async () => {
    const { entityId, invoice } = await transferInvoice();
    const body = {
      amountCents: invoice.totalTtcCents,
      receivedOn: today(),
      reference: "VIR CLIENT",
      invoiceIds: [invoice.id],
    };
    await record(entityId, body, FIRST_KEY).expect(201);

    const refusal = await record(entityId, body, SECOND_KEY).expect(409);

    expect(JSON.stringify(refusal.body)).toContain(`${invoice.number} est déjà réglée`);
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(1);
  });

  it("un écart est refusé (409, en euros) et rien n'est écrit", async () => {
    const { entityId, invoice } = await transferInvoice();

    const refusal = await record(
      entityId,
      {
        amountCents: invoice.totalTtcCents - 100,
        receivedOn: today(),
        reference: "VIR CLIENT",
        invoiceIds: [invoice.id],
      },
      FIRST_KEY,
    ).expect(409);

    expect(JSON.stringify(refusal.body)).toMatch(/écart de 1,00\s€ manquants/u);
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(0);
    expect(await ctx.prisma.orderCollection.count()).toBe(0);
  });

  it("une facture au prélèvement est refusée", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await staff()
      .post("/admin/accounting/monthly-invoices")
      .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
      .expect(200);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({ where: { payerCompanyId: payer } });

    const refusal = await record(
      entityId,
      {
        amountCents: invoice.totalTtcCents,
        receivedOn: today(),
        reference: "VIR",
        invoiceIds: [invoice.id],
      },
      FIRST_KEY,
    ).expect(409);

    expect(JSON.stringify(refusal.body)).toContain(
      `${invoice.number} ne se règle pas par virement`,
    );
  });
});

describe("le statut et les impayés d'une facture au virement (V8, C7)", () => {
  it("attendue, puis en retard après l'échéance, puis réglée — au suivi et dans « Mes factures »", async () => {
    const { entityId, payer, invoice } = await transferInvoice();
    const mine = async (): Promise<MyIssuedInvoicesView> =>
      jsonBody<MyIssuedInvoicesView>(
        await ctx.asSub("r5-owner").get(`/companies/${payer}/invoices`).expect(200),
      );
    const unpaid = async (query: string): Promise<UnpaidTransferInvoicesView> =>
      jsonBody<UnpaidTransferInvoicesView>(await staff().get(`${UNPAID}?${query}`).expect(200));

    expect((await mine()).invoices[0]?.settlement?.status).toBe("transfer_expected");
    expect((await unpaid(`payerCompanyId=${payer}`)).invoices).toEqual([
      expect.objectContaining({ invoiceId: invoice.id, overdue: false, daysLate: 0 }),
    ]);
    expect((await unpaid(`legalEntityId=${entityId}&overdue=true`)).invoices).toEqual([]);

    // Deux jours après l'échéance, à midi.
    clock.set(new Date(invoice.dueOn.getTime() + 2 * DAY_MS + 12 * HOUR_MS));

    expect((await mine()).invoices[0]?.settlement).toEqual({
      status: "transfer_overdue",
      date: invoice.dueOn.toISOString().slice(0, 10),
      otherInvoicesOnDebit: 0,
    });
    const overdue = await unpaid(`legalEntityId=${entityId}&overdue=true`);
    expect(overdue.invoices).toEqual([
      expect.objectContaining({ number: invoice.number, overdue: true, daysLate: 2 }),
    ]);
    expect(overdue.overdueCents).toBe(invoice.totalTtcCents);

    const receivedOn = today();
    await record(
      entityId,
      {
        amountCents: invoice.totalTtcCents,
        receivedOn,
        reference: "VIR",
        invoiceIds: [invoice.id],
      },
      FIRST_KEY,
    ).expect(201);

    expect((await mine()).invoices[0]?.settlement).toEqual({
      status: "settled",
      date: receivedOn,
      otherInvoicesOnDebit: 0,
    });
    expect((await unpaid(`payerCompanyId=${payer}`)).invoices).toEqual([]);
  });
});
