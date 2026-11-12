/**
 * E2E des **lectures du virement** (plan
 * `documentation/comptabilite/le-paiement-par-virement.md`,
 * décisions de la nuit (a), (c) et T5).
 *
 * Ce que seul le vrai serveur prouve : l'aperçu dit l'écart que la saisie
 * refuserait, et rien d'autre (aperçu = validation), sans rien écrire, sous
 * le droit de lecture de la comptabilité ; la vue d'une facture réglée dit le
 * jour du virement, au staff et au client ; le moyen d'encaissement se lit
 * dans l'espace client sous le mur — un membre d'une autre société reçoit 404.
 */
import type {
  BankTransferPreviewView,
  IssuedInvoiceView,
  MyCollectionMeansView,
} from "@lfd/contracts";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { ENTITIES, FIRST_KEY, record, today, transferInvoice } from "./bank-transfer-scene.js";
import { jsonBody } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import {
  closesAt,
  ctx,
  invoicedPayer,
  readerStaff,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";

useCollectionReturnScene();

function preview(entityId: string, amountCents: number, invoiceIds: readonly string[]) {
  return `${ENTITIES}/${entityId}/bank-transfers/preview?amountCents=${String(amountCents)}&invoiceIds=${invoiceIds.join(",")}`;
}

describe("l'aperçu d'un virement avant de le valider (a)", () => {
  it("dit l'écart que la saisie refuse, puis l'écart nul que la saisie accepte — sans rien écrire", async () => {
    const { entityId, invoice } = await transferInvoice();
    const short = invoice.totalTtcCents - 100;

    const gap = jsonBody<BankTransferPreviewView>(
      await staff()
        .get(preview(entityId, short, [invoice.id]))
        .expect(200),
    );
    expect(gap).toEqual({
      amountCents: short,
      invoicesDueCents: invoice.totalTtcCents,
      gapCents: -100,
    });
    expect(await ctx.prisma.receivedBankTransfer.count()).toBe(0);
    expect(await ctx.prisma.orderCollection.count()).toBe(0);
    const body = { receivedOn: today(), reference: "VIR", invoiceIds: [invoice.id] };
    await record(entityId, { ...body, amountCents: short }, FIRST_KEY).expect(409);

    const exact = jsonBody<BankTransferPreviewView>(
      await staff()
        .get(preview(entityId, invoice.totalTtcCents, [invoice.id]))
        .expect(200),
    );
    expect(exact.gapCents).toBe(0);
    await record(entityId, { ...body, amountCents: invoice.totalTtcCents }, FIRST_KEY).expect(201);
  });

  it("refuse une facture au prélèvement, comme la saisie", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await staff()
      .post("/admin/accounting/monthly-invoices")
      .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
      .expect(200);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({ where: { payerCompanyId: payer } });

    const refusal = await staff()
      .get(preview(entityId, invoice.totalTtcCents, [invoice.id]))
      .expect(409);

    expect(JSON.stringify(refusal.body)).toContain(
      `${invoice.number} ne se règle pas par virement`,
    );
  });

  it("se lit avec la lecture de la comptabilité ; sans elle, 403", async () => {
    const { entityId, invoice } = await transferInvoice();
    await readerStaff(ctx, "transfer-reader", "read");
    await readerStaff(ctx, "transfer-stranger", null);

    await ctx
      .asSub("transfer-reader")
      .get(preview(entityId, 1, [invoice.id]))
      .expect(200);
    await ctx
      .asSub("transfer-stranger")
      .get(preview(entityId, 1, [invoice.id]))
      .expect(403);
  });
});

describe("« Réglée par virement le … » dans la vue d'une facture (c)", () => {
  it("null avant le virement ; le jour reçu ensuite, au staff et au client", async () => {
    const { entityId, payer, invoice } = await transferInvoice();
    const asStaff = async (): Promise<IssuedInvoiceView> =>
      jsonBody<IssuedInvoiceView>(
        await staff().get(`/admin/accounting/invoices/${invoice.id}`).expect(200),
      );
    const asClient = async (): Promise<IssuedInvoiceView> =>
      jsonBody<IssuedInvoiceView>(
        await ctx.asSub("r5-owner").get(`/companies/${payer}/invoices/${invoice.id}`).expect(200),
      );
    expect((await asStaff()).settledByTransferOn).toBeNull();

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

    expect((await asStaff()).settledByTransferOn).toBe(receivedOn);
    expect((await asClient()).settledByTransferOn).toBe(receivedOn);
  });
});

describe("le moyen d'encaissement dans l'espace client (T5)", () => {
  it("le membre lit « virement » ; un membre d'une autre société reçoit 404", async () => {
    const { payer } = await transferInvoice();
    const other = await createCompany(ctx.prisma, { raisonSociale: "Voisin" });
    const stranger = await createUser(ctx.prisma, {
      auth0Sub: "t5-stranger",
      email: "v@voisin.test",
    });
    await attachTo(ctx.prisma, stranger.id, other.id, CustomerRole.owner);

    const view = jsonBody<MyCollectionMeansView>(
      await ctx.asSub("r5-owner").get(`/companies/${payer}/collection-means`).expect(200),
    );

    expect(view).toEqual({ means: "bank_transfer" });
    expect(JSON.stringify(view)).not.toMatch(/FR76|iban/iu);
    await ctx.asSub("t5-stranger").get(`/companies/${payer}/collection-means`).expect(404);
  });

  it("un payeur qui n'a rien changé lit « prélèvement »", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);

    const view = jsonBody<MyCollectionMeansView>(
      await ctx.asSub("r5-owner").get(`/companies/${payer}/collection-means`).expect(200),
    );

    expect(view.means).toBe("sepa_debit");
  });
});
