import type { LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";

import type { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import type {
  LegalEntity as LegalEntityTable,
  Prisma,
} from "../../../platform/database/client/client.js";
import {
  type BankCollectionLimitsSnapshot,
  LegalEntity,
  type LegalEntitySnapshot,
} from "../domain/entities/legal-entity.js";
import type { SepaScheme } from "../domain/value-objects/sepa-scheme.js";
import { sellerBlockers } from "../domain/services/invoice-issuance-blockers.js";

/**
 * Ce que toute relecture d'une entité charge en plus de sa ligne : UNE de ses
 * pièces, s'il y en a — c'est ce qui gèle son préfixe de numéro (lot ZA).
 */
export const LEGAL_ENTITY_ROW_INCLUDE = {
  invoices: { select: { id: true }, take: 1 },
  bankLimits: {
    select: { scheme: true, perDebitCents: true, perRemittanceCents: true, monthlyCents: true },
  },
} as const satisfies Prisma.LegalEntityInclude;

export type LegalEntityRow = LegalEntityTable & {
  readonly invoices: readonly { readonly id: string }[];
  readonly bankLimits: readonly BankCollectionLimitsSnapshot[];
};

/**
 * Ligne → agrégat. Les value objects **revalident** au passage : une ligne écrite
 * par une main tierce (script, correction en SQL) est refusée à la relecture
 * plutôt que promenée dans le domaine.
 */
export function toDomain(row: LegalEntityRow, cipher: FieldCipher): LegalEntity {
  return LegalEntity.reconstitute(toSnapshot(row, cipher), row.bankLimits);
}

/**
 * L'IBAN créancier CONFIRMÉ — le scellé, et lui seul.
 *
 * 🔴 L'instantané du créancier (factures, lot SEPA, mandat, arrêtés) se bâtit
 * sur ce que rend cette fonction : ni la proposition en attente
 * (`pending_creditor_iban_sealed`), ni l'ancienne colonne claire
 * `creditor_iban`, qui n'est plus alimentée depuis le scellement et ne sert
 * plus que de retour arrière (`le-paiement-par-virement.md`,
 * T0). Une entité qui n'aurait que la valeur claire se lit sans compte, et son
 * compte se ressaisit par l'écran — première saisie, donc immédiate.
 */
function creditorIbanOf(row: LegalEntityRow, cipher: FieldCipher): string | null {
  return openSealed(row.creditorIbanSealed, cipher);
}

/** Un scellé ouvert, ou `null` s'il n'y en a pas. */
function openSealed(sealed: string | null, cipher: FieldCipher): string | null {
  return sealed === null || sealed === "" ? null : cipher.open(sealed);
}

/** Un IBAN scellé pour l'écriture, ou `null`. */
function sealOrNull(iban: string | null, cipher: FieldCipher): string | null {
  return iban === null || iban === "" ? null : cipher.seal(iban);
}

/** Agrégat → vue d'écran. */
export function toView(entity: LegalEntity, isLastActive: boolean): LegalEntityRecord {
  const snapshot = entity.toPersistence();
  return {
    id: snapshot.id,
    name: snapshot.name,
    legalForm: snapshot.legalForm,
    siren: snapshot.siren,
    vatNumber: snapshot.vatNumber,
    rcs: snapshot.rcs,
    shareCapitalCents: snapshot.shareCapitalCents,
    addressLine1: snapshot.addressLine1,
    addressLine2: snapshot.addressLine2,
    postalCode: snapshot.postalCode,
    city: snapshot.city,
    countryCode: snapshot.countryCode,
    // `null` devient `""` : l'absence d'ICS est un état normal et durable, pas
    // une donnée manquante à signaler. Ce que l'écran doit dire de cette absence
    // est déjà dans `missingToCollect`, rédigé une seule fois.
    ics: snapshot.ics ?? "",
    // 🔴 Le compte ne sort JAMAIS d'ici en entier. Quatre caractères suffisent à
    // reconnaître un compte, ce qui est la seule question qu'on se pose devant
    // une fiche — et c'est la seule question à laquelle une réponse d'API a le
    // droit de répondre.
    creditorAccountLast4: snapshot.creditorIban?.slice(-4) ?? "",
    creditorBic: snapshot.creditorBic ?? "",
    // Le bloc du RIB, lui, ressort EN ENTIER : titulaire et adresse s'impriment
    // sur chaque mandat qu'on fait signer. Rien à y masquer — et le masquer
    // empêcherait de relire ce qu'on va imprimer.
    creditorAccountHolder: snapshot.creditorAccountHolder ?? "",
    creditorAccountLine1: snapshot.creditorAccountLine1 ?? "",
    creditorAccountLine2: snapshot.creditorAccountLine2 ?? "",
    creditorAccountPostalCode: snapshot.creditorAccountPostalCode ?? "",
    creditorAccountCity: snapshot.creditorAccountCity ?? "",
    creditorAccountCountryCode: snapshot.creditorAccountCountryCode ?? "",
    creditorIdentityFrozen: entity.creditorIdentityFrozen,
    pendingCreditorAccount: pendingView(entity),
    preNotificationDays: snapshot.preNotificationDays,
    transferDueDaysAfterIssue: snapshot.transferDueDaysAfterIssue,
    autoCollectionEnabled: snapshot.autoCollectionEnabled,
    autoCollectionDelayHours: snapshot.autoCollectionDelayHours,
    collectionDaysAfterClosure: snapshot.collectionDaysAfterClosure,
    depositCutoff: entity.collectionSchedule.depositCutoff,
    bankCollectionLimits: { CORE: limitsView(entity, "CORE"), B2B: limitsView(entity, "B2B") },
    invoicePaymentTerms: {
      latePenaltyRateBasisPoints: snapshot.invoiceLatePenaltyRateBasisPoints,
      recoveryIndemnityCents: snapshot.invoiceRecoveryIndemnityCents,
      earlyPaymentDiscount: snapshot.invoiceEarlyPaymentDiscount,
    },
    // Du domaine, comme `missingToCollect` : une seule définition de « peut facturer ».
    missingToInvoice: sellerBlockers(entity.invoiceSellerFacts()).map((blocker) => blocker.message),
    invoicePrefix: snapshot.invoicePrefix,
    invoicePrefixFrozen: entity.invoicePrefixFrozen,
    mandateContractDescription: snapshot.mandateContractDescription,
    mandatePaymentType: snapshot.mandatePaymentType,
    mandateScheme: snapshot.mandateScheme,
    archivedAt: snapshot.archivedAt?.toISOString() ?? null,
    canCollect: entity.canCollect(),
    missingToCollect: entity.missingToCollect(),
    // 🔴 Un booléen, jamais `snapshot.logoKey`. La clé de stockage est un détail
    // interne du bucket, et une clé qui SORT d'une API est une clé qu'on finit
    // par accepter en ENTRÉE. Un e2e le tient.
    hasLogo: entity.hasLogo,
    // Passé plutôt que déduit : le mapper voit UNE entité, et « la dernière »
    // est une propriété de l'ensemble. Le lui faire calculer supposerait de lui
    // donner un dépôt, c'est-à-dire d'en faire autre chose qu'un mapper.
    isLastActive,
  };
}

/**
 * La proposition en attente telle que la fiche la montre : quatre caractères
 * de l'IBAN, le reste en entier (comme le compte confirmé), l'auteur par sa
 * fiche — son nom est résolu par l'application.
 */
function pendingView(entity: LegalEntity): LegalEntityRecord["pendingCreditorAccount"] {
  const pending = entity.pendingCreditorAccount;
  if (pending === null) {
    return null;
  }
  const { account } = pending;
  return {
    id: pending.id,
    last4: pending.last4(),
    bic: account.bic.value,
    holder: account.holder,
    line1: account.address.line1,
    line2: account.address.line2,
    postalCode: account.address.postalCode,
    city: account.address.city,
    countryCode: account.address.countryCode,
    proposedByStaffId: pending.proposedByStaffId,
    proposedAt: pending.proposedAt.toISOString(),
  };
}

/** Les plafonds d'un schéma, tels que l'écran les lit ; `null` = non renseigné. */
function limitsView(
  entity: LegalEntity,
  scheme: SepaScheme,
): LegalEntityRecord["bankCollectionLimits"][SepaScheme] {
  const limits = entity.bankCollectionLimits(scheme);
  return {
    perDebitCents: limits.perDebitCents,
    perRemittanceCents: limits.perRemittanceCents,
    monthlyCents: limits.monthlyCents,
  };
}

/** Ligne → état complet, sans reconstruire l'agrégat. */
function toSnapshot(row: LegalEntityRow, cipher: FieldCipher): LegalEntitySnapshot {
  return {
    id: row.id,
    name: row.name,
    legalForm: row.legalForm,
    siren: row.siren,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    city: row.city,
    countryCode: row.countryCode,
    rcs: row.rcs,
    shareCapitalCents: row.shareCapitalCents,
    vatNumber: row.vatNumber,
    ics: row.ics,
    creditorIban: creditorIbanOf(row, cipher),
    creditorBic: row.creditorBic,
    creditorAccountHolder: row.creditorAccountHolder,
    creditorAccountLine1: row.creditorAccountLine1,
    creditorAccountLine2: row.creditorAccountLine2,
    creditorAccountPostalCode: row.creditorAccountPostalCode,
    creditorAccountCity: row.creditorAccountCity,
    creditorAccountCountryCode: row.creditorAccountCountryCode,
    pendingCreditorAccountId: row.pendingCreditorAccountId,
    pendingCreditorIban: openSealed(row.pendingCreditorIbanSealed, cipher),
    pendingCreditorBic: row.pendingCreditorBic,
    pendingCreditorAccountHolder: row.pendingCreditorAccountHolder,
    pendingCreditorAccountLine1: row.pendingCreditorAccountLine1,
    pendingCreditorAccountLine2: row.pendingCreditorAccountLine2,
    pendingCreditorAccountPostalCode: row.pendingCreditorAccountPostalCode,
    pendingCreditorAccountCity: row.pendingCreditorAccountCity,
    pendingCreditorAccountCountryCode: row.pendingCreditorAccountCountryCode,
    pendingCreditorAccountProposedByStaffId: row.pendingCreditorAccountProposedByStaffId,
    pendingCreditorAccountProposedAt: row.pendingCreditorAccountProposedAt,
    version: row.version,
    firstMandateIssuedAt: row.firstMandateIssuedAt,
    preNotificationDays: row.preNotificationDays,
    transferDueDaysAfterIssue: row.transferDueDaysAfterIssue,
    mandateContractDescription: row.mandateContractDescription,
    mandatePaymentType: row.mandatePaymentType,
    mandateScheme: row.mandateScheme,
    logoKey: row.logoKey,
    archivedAt: row.archivedAt,
    autoCollectionEnabled: row.autoCollectionEnabled,
    autoCollectionDelayHours: row.autoCollectionDelayHours,
    collectionDaysAfterClosure: row.collectionDaysAfterClosure,
    depositCutoffBusinessDays: row.depositCutoffBusinessDays,
    depositCutoffTime: row.depositCutoffTime,
    invoiceLatePenaltyRateBasisPoints: row.invoiceLatePenaltyRateBasisPoints,
    invoiceRecoveryIndemnityCents: row.invoiceRecoveryIndemnityCents,
    invoiceEarlyPaymentDiscount: row.invoiceEarlyPaymentDiscount,
    invoicePrefix: row.invoicePrefix,
    invoicesIssued: row.invoices.length > 0,
  };
}

/**
 * État → colonnes d'écriture.
 *
 * 🔴 **Pure et exportée pour être ÉPROUVÉE**, pas par élégance. La liste est
 * explicite — elle doit l'être, `id` et les horodatages n'ayant rien à faire
 * dans un `update` — et une colonne neuve oubliée ici s'écrit **sans erreur** :
 * la commande réussit, l'écran annonce « enregistré », et la relecture rend
 * l'ancienne valeur. C'est arrivé le 2026-09-12 avec les réglages de mandat.
 *
 * Le test qui l'accompagne compare ses clés à celles de l'état, et échoue au
 * prochain champ ajouté à l'agrégat sans l'être ici. C'est la seule façon de
 * transformer un oubli silencieux en rouge.
 */
/**
 * Agrégat → colonnes.
 *
 * ⚠️ **N'écrit plus la colonne claire.** `creditor_iban` garde ce qu'elle avait
 * et n'est plus alimentée : c'est ce qui fait d'elle un retour arrière plutôt
 * qu'une seconde vérité qui dériverait. Une entité corrigée après le
 * 2026-09-12 laisse donc derrière elle une valeur claire PÉRIMÉE — inoffensive,
 * puisque la lecture prend le scellé d'abord, et supprimée au palier 3.
 *
 * 🔴 **N'écrit pas `first_mandate_issued_at`** (depuis le 2026-09-15, plan
 * `restes-du-mandat.md` #6). Le verrou n'a qu'un auteur,
 * `FirstMandateLedger`, qui l'écrit sous condition dans la transaction de la
 * frappe. S'il figurait ici, un geste staff qui a chargé l'entité AVANT une
 * frappe concurrente le remettrait à `null` en sauvant — et le créancier
 * imprimé redeviendrait corrigeable sous des mandats déjà frappés.
 *
 * N'écrit pas non plus `invoicesIssued` (lot ZA) : ce n'est pas une colonne,
 * c'est l'existence d'une ligne d'`invoice`, lue à la relecture.
 *
 * N'écrit pas `version` : c'est `save` qui la compare et l'incrémente, dans la
 * même requête que ces colonnes. La proposition en attente part, comme le
 * compte confirmé, avec son IBAN scellé.
 */
export function legalEntityColumns(
  snapshot: LegalEntitySnapshot,
  cipher: FieldCipher,
): Omit<
  LegalEntitySnapshot,
  | "id"
  | "creditorIban"
  | "pendingCreditorIban"
  | "firstMandateIssuedAt"
  | "invoicesIssued"
  | "version"
> & {
  readonly creditorIbanSealed: string | null;
  readonly pendingCreditorIbanSealed: string | null;
} {
  return {
    name: snapshot.name,
    legalForm: snapshot.legalForm,
    siren: snapshot.siren,
    rcs: snapshot.rcs,
    vatNumber: snapshot.vatNumber,
    shareCapitalCents: snapshot.shareCapitalCents,
    addressLine1: snapshot.addressLine1,
    addressLine2: snapshot.addressLine2,
    postalCode: snapshot.postalCode,
    city: snapshot.city,
    countryCode: snapshot.countryCode,
    ics: snapshot.ics,
    creditorIbanSealed: sealOrNull(snapshot.creditorIban, cipher),
    creditorBic: snapshot.creditorBic,
    creditorAccountHolder: snapshot.creditorAccountHolder,
    creditorAccountLine1: snapshot.creditorAccountLine1,
    creditorAccountLine2: snapshot.creditorAccountLine2,
    creditorAccountPostalCode: snapshot.creditorAccountPostalCode,
    creditorAccountCity: snapshot.creditorAccountCity,
    creditorAccountCountryCode: snapshot.creditorAccountCountryCode,
    pendingCreditorAccountId: snapshot.pendingCreditorAccountId,
    pendingCreditorIbanSealed: sealOrNull(snapshot.pendingCreditorIban, cipher),
    pendingCreditorBic: snapshot.pendingCreditorBic,
    pendingCreditorAccountHolder: snapshot.pendingCreditorAccountHolder,
    pendingCreditorAccountLine1: snapshot.pendingCreditorAccountLine1,
    pendingCreditorAccountLine2: snapshot.pendingCreditorAccountLine2,
    pendingCreditorAccountPostalCode: snapshot.pendingCreditorAccountPostalCode,
    pendingCreditorAccountCity: snapshot.pendingCreditorAccountCity,
    pendingCreditorAccountCountryCode: snapshot.pendingCreditorAccountCountryCode,
    pendingCreditorAccountProposedByStaffId: snapshot.pendingCreditorAccountProposedByStaffId,
    pendingCreditorAccountProposedAt: snapshot.pendingCreditorAccountProposedAt,
    preNotificationDays: snapshot.preNotificationDays,
    transferDueDaysAfterIssue: snapshot.transferDueDaysAfterIssue,
    mandateContractDescription: snapshot.mandateContractDescription,
    mandatePaymentType: snapshot.mandatePaymentType,
    mandateScheme: snapshot.mandateScheme,
    logoKey: snapshot.logoKey,
    archivedAt: snapshot.archivedAt,
    autoCollectionEnabled: snapshot.autoCollectionEnabled,
    autoCollectionDelayHours: snapshot.autoCollectionDelayHours,
    collectionDaysAfterClosure: snapshot.collectionDaysAfterClosure,
    depositCutoffBusinessDays: snapshot.depositCutoffBusinessDays,
    depositCutoffTime: snapshot.depositCutoffTime,
    invoiceLatePenaltyRateBasisPoints: snapshot.invoiceLatePenaltyRateBasisPoints,
    invoiceRecoveryIndemnityCents: snapshot.invoiceRecoveryIndemnityCents,
    invoiceEarlyPaymentDiscount: snapshot.invoiceEarlyPaymentDiscount,
    invoicePrefix: snapshot.invoicePrefix,
  };
}
