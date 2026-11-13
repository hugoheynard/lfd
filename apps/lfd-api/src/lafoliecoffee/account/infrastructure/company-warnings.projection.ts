import type { Prisma } from "../../../platform/database/client/client.js";

import type { WarningInput } from "../domain/services/company-warnings.js";
import { billingCarriedAt } from "./company-hierarchy.projection.js";
import { warningPayerOf } from "./transfer-payers.projection.js";

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
  parentCompany: { select: { status: true } },
  follows: {
    where: { aspect: "billing", validTo: null },
    select: { validFrom: true, parentId: true },
    take: 1,
  },
} satisfies Prisma.CompanySelect;

type WarningRow = Prisma.CompanyGetPayload<{ select: typeof WARNING_SELECT }>;

/**
 * Traduit une ligne société en l'entrée pure du calcul des avertissements.
 * `transferPayers` : les payeurs au virement du lot (`transferPayersAmong`),
 * lus une fois pour toutes les lignes.
 */
export function warningInputOf(
  company: WarningRow,
  now: Date,
  transferPayers: ReadonlySet<string>,
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
    collectsByTransfer: transferPayers.has(payer),
    billedByParent: payer !== company.id,
    kbisUploadedAt: company.kbisUploadedAt,
    kbisCertifiedAt: company.kbisCertifiedAt,
    legalIdentityCarriedByParent: billingCarriedAt(company.parentCompany, company.follows, now),
  };
}

/** Les payeurs d'un lot de lignes, pour `transferPayersAmong`. */
export function warningPayersOf(rows: readonly WarningRow[], now: Date): readonly string[] {
  return rows.map((row) => warningPayerOf(row.id, row.follows, now));
}
