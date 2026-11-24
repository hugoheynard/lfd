import type { Prisma } from "../../../platform/database/client/client.js";

import type { WarningInput } from "../domain/services/company-warnings.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { awaitingQuotesSinceAmong } from "./awaiting-period-quotes.projection.js";
import { billingCarriedAt } from "./company-hierarchy.projection.js";
import { transferPayersAmong, warningPayerOf } from "./transfer-payers.projection.js";

/**
 * Les colonnes que le calcul des avertissements lit, et elles seules.
 *
 * Partagées par la liste (qui en lit davantage) et par le compteur du menu
 * (qui ne lit que celles-ci) : les deux appliquent `companyWarnings` à la même
 * entrée, et ne peuvent donc pas diverger sur ce qui compte.
 */
export const WARNING_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  raisonSociale: true,
  formeJuridique: true,
  siret: true,
  contactEmail: true,
  grantedTerms: true,
  kbisUploadedAt: true,
  kbisCertifiedAt: true,
  addresses: {
    where: { kind: "billing", archivedAt: null },
    select: { id: true },
    take: 1,
  },
  mandates: {
    where: { status: "active" },
    select: { id: true },
    take: 1,
  },
  // Un COMPTE : la relation `addresses` est déjà prise par la facturation.
  _count: {
    select: { addresses: { where: { kind: "delivery", archivedAt: null } } },
  },
  parentCompany: { select: { status: true } },
  follows: {
    where: { aspect: "billing", validTo: null },
    select: { validFrom: true, parentId: true },
    take: 1,
  },
} satisfies Prisma.CompanySelect;

type WarningRow = Prisma.CompanyGetPayload<{ select: typeof WARNING_SELECT }>;

/**
 * Ce que le calcul lit hors de la ligne société, une fois pour tout le lot :
 * les payeurs au virement (`transferPayersAmong`) et, par payeur, son plus
 * ancien devis de période en attente (`awaitingQuotesSinceAmong`).
 */
export interface WarningLedger {
  readonly transferPayers: ReadonlySet<string>;
  readonly awaitingQuotes: ReadonlyMap<string, Date>;
}

/** Les deux lectures du lot, en parallèle. */
export async function warningLedgerOf(
  prisma: PrismaService,
  rows: readonly WarningRow[],
  now: Date,
): Promise<WarningLedger> {
  const [transferPayers, awaitingQuotes] = await Promise.all([
    transferPayersAmong(prisma, warningPayersOf(rows, now), now),
    awaitingQuotesSinceAmong(
      prisma,
      rows.map((row) => row.id),
    ),
  ]);
  return { transferPayers, awaitingQuotes };
}

/** Traduit une ligne société en l'entrée pure du calcul des avertissements. */
export function warningInputOf(
  company: WarningRow,
  now: Date,
  ledger: WarningLedger,
): WarningInput {
  const payer = warningPayerOf(company.id, company.follows, now);
  return {
    status: company.status,
    createdAt: company.createdAt,
    hasLegalIdentity:
      company.raisonSociale.trim() !== "" &&
      company.formeJuridique.trim() !== "" &&
      company.siret.trim() !== "",
    hasHolder: company.contactEmail.trim() !== "",
    hasBillingAddress: company.addresses.length > 0,
    hasGrantedTerms: company.grantedTerms.length > 0,
    hasActiveMandate: company.mandates.length > 0,
    collectsByTransfer: ledger.transferPayers.has(payer),
    billedByParent: payer !== company.id,
    kbisUploadedAt: company.kbisUploadedAt,
    kbisCertifiedAt: company.kbisCertifiedAt,
    legalIdentityCarriedByParent: billingCarriedAt(company.parentCompany, company.follows, now),
    deliveryAddressCount: company._count.addresses,
    // Le devis est au payeur légal : la ligne d'un site n'en a jamais.
    awaitingQuoteSince: ledger.awaitingQuotes.get(company.id) ?? null,
  };
}

/** Les payeurs d'un lot de lignes, pour `transferPayersAmong`. */
export function warningPayersOf(rows: readonly WarningRow[], now: Date): readonly string[] {
  return rows.map((row) => warningPayerOf(row.id, row.follows, now));
}
