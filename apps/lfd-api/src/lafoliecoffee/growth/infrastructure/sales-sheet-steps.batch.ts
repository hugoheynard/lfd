import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { collectionMeansAt } from "../../accounting/domain/services/collection-means-timeline.js";
import { PayerTimeline } from "../../accounting/domain/services/payer-timeline.js";
import type { BillingMode } from "../../accounting/domain/value-objects/billing-mode.js";
import type { CollectionMeans } from "../../accounting/domain/value-objects/collection-means.js";
import {
  modeTimelinesOf,
  payerModeSegmentOf,
} from "../../accounting/infrastructure/billing-mode.mapper.js";
import { payerMeansEntryOf } from "../../accounting/infrastructure/collection-means.mapper.js";

const ACTIVE_MANDATE = "active";

/** Ce que les lectures par lot de la grille d'étapes ont rassemblé, par société. */
export interface StepBatch {
  readonly otherPhones: ReadonlyMap<string, readonly string[]>;
  readonly bankAccounts: ReadonlySet<string>;
  readonly activeMandates: ReadonlySet<string>;
  readonly collection: ReadonlyMap<
    string,
    { readonly rhythm: BillingMode; readonly means: CollectionMeans }
  >;
}

/**
 * **La grille d'étapes, par lot** : six lectures pour toutes les fiches —
 * téléphones du carnet, RIB, mandats actifs, puis l'entité en service, les
 * modes et les moyens d'encaissement des payeurs.
 *
 * Le payeur est la fiche elle-même : le suivi n'a que des fiches principales,
 * qui ne suivent la facturation de personne.
 *
 * L'entité : celle en service la plus ancienne (`archived_at` nul, par
 * `created_at`), l'ordre de `activeIssuers`. Aucune : le mensuel et le
 * prélèvement, les défauts de la comptabilité. Le rythme est le mode en
 * vigueur à `now` (`PayerTimeline.modeAt`, mensuel sans segment vivant), le
 * moyen celui de `collectionMeansAt` (prélèvement sans segment vivant) : un
 * segment annulé ne compte pas, un segment programmé non plus.
 */
export async function readStepBatch(
  prisma: PrismaService,
  ids: readonly string[],
  now: Date,
): Promise<StepBatch> {
  const companyId = { in: [...ids] };
  const [contacts, banks, mandates, entity, modes, means] = await Promise.all([
    prisma.companyContact.findMany({
      where: { companyId, telephone: { not: "" } },
      select: { companyId: true, telephone: true },
    }),
    prisma.companyBankAccount.findMany({ where: { companyId }, select: { companyId: true } }),
    prisma.paymentMandate.findMany({
      where: { companyId, status: ACTIVE_MANDATE },
      distinct: ["companyId"],
      select: { companyId: true },
    }),
    prisma.legalEntity.findFirst({
      where: { archivedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
    prisma.payerBillingMode.findMany({
      where: { payerCompanyId: companyId, cancelledAt: null },
      select: {
        legalEntityId: true,
        payerCompanyId: true,
        mode: true,
        effectiveFrom: true,
        createdAt: true,
      },
    }),
    prisma.payerCollectionMeans.findMany({ where: { payerCompanyId: companyId } }),
  ]);
  const ofEntity = <T extends { readonly legalEntityId: string }>(rows: readonly T[]): T[] =>
    entity === null ? [] : rows.filter((row) => row.legalEntityId === entity.id);
  const noDates = modeTimelinesOf([]);
  return {
    otherPhones: groupBy(contacts.map((row) => [row.companyId, row.telephone] as const)),
    bankAccounts: new Set(banks.map((row) => row.companyId)),
    activeMandates: new Set(mandates.map((row) => row.companyId)),
    collection: new Map(
      ids.map((id) => {
        const segments = ofEntity(modes)
          .filter((row) => row.payerCompanyId === id)
          .map(payerModeSegmentOf);
        const entries = ofEntity(means)
          .filter((row) => row.payerCompanyId === id)
          .map(payerMeansEntryOf);
        return [
          id,
          {
            rhythm: PayerTimeline.of(segments, noDates).modeAt(now).mode,
            means: collectionMeansAt(entries, now).means,
          },
        ] as const;
      }),
    ),
  };
}

function groupBy(
  pairs: readonly (readonly [string, string])[],
): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, string[]>();
  for (const [id, value] of pairs) {
    found.set(id, [...(found.get(id) ?? []), value]);
  }
  return found;
}
