/**
 * E2E du **virement reçu dans le bloc `payment`** (plan
 * `documentation/payment/plan-le-virement-recu-dans-payment.md`, lot D1).
 *
 * Ce que seul le vrai serveur prouve : après le renommage, la base tient
 * toujours l'ajout seul sur les deux tables déménagées ; et le contrôle de
 * cohérence de nuit — ce qui remplace les clés étrangères entre les blocs —
 * se tait quand les deux côtés sont d'accord, et sonne au premier écart
 * fabriqué, sans rien corriger.
 *
 * Aucune date absolue : le jour de réception et l'instant d'écriture sont
 * ceux de l'horloge du test.
 */
import type { RecordedBankTransferView } from "@lfd/contracts";
import { FIRST_KEY, record, today, transferInvoice } from "./bank-transfer-scene.js";
import { clock, ctx, useCollectionReturnScene } from "./collection-returns-scene.js";
import { jsonBody } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

useCollectionReturnScene();

const CONSISTENCY = "/admin/accounting/bank-transfers/consistency";

interface ConsistencyReport {
  readonly checkedOrders: number;
  readonly checkedTransfers: number;
  readonly gaps: number;
}

/** Un virement saisi par le vrai geste, sur la facture du mois. */
async function recordedTransfer(): Promise<{ transferId: string; invoiceId: string }> {
  const { entityId, invoice } = await transferInvoice();
  const body = {
    amountCents: invoice.totalTtcCents,
    receivedOn: today(),
    reference: invoice.number,
    invoiceIds: [invoice.id],
  };
  const { transferId } = jsonBody<RecordedBankTransferView>(
    await record(entityId, body, FIRST_KEY).expect(201),
  );
  return { transferId, invoiceId: invoice.id };
}

async function check(): Promise<ConsistencyReport> {
  const response = await ctx
    .http()
    .post(CONSISTENCY)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<ConsistencyReport>(response);
}

describe("le virement reçu déménagé : l'ajout seul tient toujours", () => {
  it("la base refuse de modifier ou d'effacer un virement et ses parts", async () => {
    const { transferId, invoiceId } = await recordedTransfer();

    await expect(
      ctx.prisma.transferReceived.update({ where: { id: transferId }, data: { reference: "X" } }),
    ).rejects.toThrow(/ne se modifie ni ne s'efface/u);
    await expect(
      ctx.prisma.transferAllocation.updateMany({ where: { transferId }, data: { amountCents: 1 } }),
    ).rejects.toThrow(/ne se modifie ni ne s'efface/u);
    await expect(
      ctx.prisma.transferAllocation.deleteMany({ where: { subjectId: invoiceId } }),
    ).rejects.toThrow(/ne se modifie ni ne s'efface/u);
    await expect(ctx.prisma.transferReceived.deleteMany({})).rejects.toThrow(
      /ne se modifie ni ne s'efface/u,
    );
    expect(await ctx.prisma.transferAllocation.count()).toBe(1);
  });

  it("la base refuse un sujet qui n'est pas une facture", async () => {
    await expect(
      ctx.prisma.transferReceived.create({
        data: {
          id: "vir_sujet_inconnu",
          receivedInto: "le_e2e",
          payerRef: "cmp_e2e",
          amountCents: 100,
          receivedOn: new Date(`${today()}T00:00:00.000Z`),
          reference: "VIR",
          recordedAt: clock.now(),
          recordedByStaffId: "staff-e2e",
          allocations: { create: [{ subjectType: "order", subjectId: "o1", amountCents: 100 }] },
        },
      }),
    ).rejects.toThrow(/transfer_allocation_subject_type_known/u);
  });
});

describe("le contrôle de cohérence de nuit (§3.6)", () => {
  it("les deux côtés d'accord : il relit, ne trouve rien, ne sonne pas", async () => {
    await recordedTransfer();

    const report = await check();

    expect(report.gaps).toBe(0);
    expect(report.checkedTransfers).toBe(1);
    expect(report.checkedOrders).toBeGreaterThan(0);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "bank_transfer.inconsistent" } }),
    ).toBe(0);
  });

  it("un virement fabriqué sur une pièce inconnue : un écart, une cloche, rien de corrigé", async () => {
    await recordedTransfer();
    await ctx.prisma.transferReceived.create({
      data: {
        id: "vir_fabrique",
        receivedInto: "le_e2e",
        payerRef: "cmp_e2e",
        amountCents: 500,
        receivedOn: new Date(`${today()}T00:00:00.000Z`),
        reference: "ÉCART FABRIQUÉ",
        recordedAt: clock.now(),
        recordedByStaffId: "staff-e2e",
        allocations: {
          create: [{ subjectType: "invoice", subjectId: "inv_fantome", amountCents: 500 }],
        },
      },
    });

    const first = await check();
    const second = await check();

    expect(first.gaps).toBe(1);
    expect(second.gaps).toBe(1);
    const bells = await ctx.prisma.staffNotification.findMany({
      where: { kind: "bank_transfer.inconsistent" },
    });
    // Rejoué, le contrôle ne sonne pas deux fois le même écart.
    expect(bells.map((bell) => bell.idempotencyKey)).toEqual([
      "notification:bank_transfer.inconsistent:allocation_unknown_invoice:vir_fabrique:inv_fantome:-",
    ]);
    expect(await ctx.prisma.transferReceived.count()).toBe(2);
  });
});
