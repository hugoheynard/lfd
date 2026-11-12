/**
 * La scène des factures au virement (e2e `bank-transfer-*.e2e-spec.ts`) :
 * une entité, un payeur au virement depuis le début du mois, sa facture émise,
 * et le geste « virement reçu ». S'appuie sur la scène des retours bancaires
 * (`useCollectionReturnScene`), que chaque suite installe.
 *
 * ⚠️ Le segment « au virement depuis le début du mois » est écrit par Prisma :
 * la route date un changement d'un payeur qui a commandé à sa PROCHAINE
 * clôture. Aucune date absolue : le mois est le précédent du jour du test.
 */
import {
  clock,
  closesAt,
  ctx,
  invoicedPayer,
  month,
  setUpEntity,
  staff,
} from "./collection-returns-scene.js";

export const ENTITIES = "/admin/accounting/legal-entities";
export const FIRST_KEY = "0b6f7f0e-2f53-4f0e-9a51-6c1f6f0b0001";
export const SECOND_KEY = "0b6f7f0e-2f53-4f0e-9a51-6c1f6f0b0002";

export async function transferSinceMonthStart(entityId: string, payerId: string): Promise<void> {
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
export async function transferInvoice(): Promise<{
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
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(clock.now());
}

export function record(entityId: string, body: object, key: string) {
  return staff()
    .post(`${ENTITIES}/${entityId}/bank-transfers`)
    .set("Idempotency-Key", key)
    .send(body);
}
