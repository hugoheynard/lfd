/**
 * E2E — **le dépôt sur Chorus Pro, à la main** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quinquies, T1′–T5′).
 *
 * Ce que seul le vrai serveur prouve : l'échéance figée à l'émission d'une
 * facture publique (date + 30 jours), la file « À déposer » lue sur la forme
 * juridique figée de l'acheteur, le geste qui écrit une ligne append-only et
 * un fait au journal, l'échéance effective relue par la liste des virements
 * impayés, le rejet, et le refus d'un second dépôt.
 *
 * Aucune date absolue : le mois est le précédent du jour du test, l'horloge
 * est celle de la scène.
 */
import { addDays, type ChorusInvoicesView, type UnpaidTransferInvoicesView } from "@lfd/contracts";

import { transferSinceMonthStart, today } from "./bank-transfer-scene.js";
import {
  clock,
  closesAt,
  ctx,
  DAY_MS,
  invoicedPayer,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { jsonBody } from "./e2e-harness.js";

useCollectionReturnScene();

const CHORUS = "/admin/accounting/chorus/invoices";
const UNPAID = "/admin/accounting/transfer-invoices/unpaid";
const PUBLIC_DEADLINE_DAYS = 30;

/** Un organisme public (l'armée), au virement, et sa facture du mois émise. */
async function publicInvoice(): Promise<{ readonly id: string; readonly issuedOn: string }> {
  const entityId = await setUpEntity(staff);
  const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
  await ctx.prisma.company.update({
    where: { id: payer },
    data: { formeJuridique: "public_state", raisonSociale: "Caserne des Alpes" },
  });
  await transferSinceMonthStart(entityId, payer);
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  const row = await ctx.prisma.invoice.findFirstOrThrow({ where: { payerCompanyId: payer } });
  return { id: row.id, issuedOn: row.issuedOn.toISOString().slice(0, 10) };
}

async function unpaidOf(invoiceId: string) {
  const view = jsonBody<UnpaidTransferInvoicesView>(await staff().get(UNPAID).expect(200));
  return view.invoices.find((one) => one.invoiceId === invoiceId);
}

describe("une facture d'organisme public, de l'émission au rejet", () => {
  it("émise à date + 30 jours, à déposer, déposée, en retard au jour ouvré qui suit, puis rejetée", async () => {
    const invoice = await publicInvoice();
    const row = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(row.dueOn?.toISOString().slice(0, 10)).toBe(
      addDays(invoice.issuedOn, PUBLIC_DEADLINE_DAYS),
    );

    // À déposer, et la liste des virements impayés la lit sans erreur, sans retard.
    const toDeposit = jsonBody<ChorusInvoicesView>(
      await staff().get(`${CHORUS}/to-deposit`).expect(200),
    );
    expect(toDeposit.invoices.map((one) => [one.invoiceId, one.chorus.state])).toEqual([
      [invoice.id, "to_deposit"],
    ]);
    expect(await unpaidOf(invoice.id)).toMatchObject({ effectiveDueOn: null, overdue: false });

    // « Déposée le … » : aujourd'hui.
    const depositedOn = today();
    await staff()
      .post(`${CHORUS}/${invoice.id}/deposit`)
      .send({ occurredOn: depositedOn })
      .expect(204);
    const effectiveDueOn = addDays(depositedOn, PUBLIC_DEADLINE_DAYS);
    expect(
      jsonBody<ChorusInvoicesView>(await staff().get(`${CHORUS}/to-deposit`).expect(200)).invoices,
    ).toEqual([]);
    const deposited = jsonBody<ChorusInvoicesView>(
      await staff().get(`${CHORUS}/deposited`).expect(200),
    );
    expect(deposited.invoices[0]?.chorus).toMatchObject({
      state: "deposited",
      depositedOn,
      effectiveDueOn,
    });
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: invoice.id, type: "invoice.chorus_deposited" },
      }),
    ).toBe(1);

    // Un second dépôt est refusé, rien n'est écrit.
    await staff()
      .post(`${CHORUS}/${invoice.id}/deposit`)
      .send({ occurredOn: depositedOn })
      .expect(409);
    expect(await ctx.prisma.invoiceChorusDeposit.count()).toBe(1);

    // Quarante jours plus tard : en retard sur l'échéance effective.
    clock.set(new Date(clock.now().getTime() + 40 * DAY_MS));
    expect(await unpaidOf(invoice.id)).toMatchObject({ effectiveDueOn, overdue: true });

    // Rejetée par Chorus : listée encore, mais jamais en retard.
    await staff()
      .post(`${CHORUS}/${invoice.id}/rejection`)
      .send({ occurredOn: today(), reason: "Numéro d'engagement inconnu" })
      .expect(204);
    expect(await unpaidOf(invoice.id)).toMatchObject({
      effectiveDueOn: null,
      overdue: false,
      chorus: { state: "rejected", rejectionReason: "Numéro d'engagement inconnu" },
    });
  });

  it("une facture d'un pro ne se dépose pas (409), et n'est jamais à déposer", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    await staff()
      .post("/admin/accounting/monthly-invoices")
      .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
      .expect(200);
    const row = await ctx.prisma.invoice.findFirstOrThrow({ where: { payerCompanyId: payer } });

    expect(
      jsonBody<ChorusInvoicesView>(await staff().get(`${CHORUS}/to-deposit`).expect(200)).invoices,
    ).toEqual([]);
    await staff().post(`${CHORUS}/${row.id}/deposit`).send({ occurredOn: today() }).expect(409);
  });

  it("le journal de dépôt refuse UPDATE et DELETE (déclencheur)", async () => {
    const invoice = await publicInvoice();
    await staff().post(`${CHORUS}/${invoice.id}/deposit`).send({ occurredOn: today() }).expect(204);

    await expect(ctx.prisma.invoiceChorusDeposit.deleteMany()).rejects.toThrow(
      /invoice_chorus_deposit_append_only/u,
    );
    await expect(
      ctx.prisma.invoiceChorusDeposit.updateMany({ data: { reason: "x" } }),
    ).rejects.toThrow(/invoice_chorus_deposit_append_only/u);
  });
});
