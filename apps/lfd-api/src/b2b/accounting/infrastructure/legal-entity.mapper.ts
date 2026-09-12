import type { LegalEntityView } from "@lfd/contracts";

import type { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import type { LegalEntity as LegalEntityRow } from "../../../platform/database/client/client.js";
import { LegalEntity, type LegalEntitySnapshot } from "../domain/entities/legal-entity.js";

/**
 * Ligne → agrégat. Les value objects **revalident** au passage : une ligne écrite
 * par une main tierce (script, correction en SQL) est refusée à la relecture
 * plutôt que promenée dans le domaine.
 */
export function toDomain(row: LegalEntityRow, cipher: FieldCipher): LegalEntity {
  return LegalEntity.reconstitute(toSnapshot(row, cipher));
}

/**
 * L'IBAN créancier, **d'où qu'il vienne** — scellé de préférence, clair sinon.
 *
 * 🔴 La bascule du 2026-09-12, palier 2 sur 3. Une entité enregistrée avant ce
 * jour porte sa valeur en clair dans `creditor_iban` ; toute écriture depuis
 * remplit `creditor_iban_sealed`. Lire le scellé D'ABORD fait que la valeur
 * ressaisie par l'écran gagne, sans qu'aucun drapeau ne soit à tenir.
 *
 * L'ordre n'est pas indifférent : l'inverse ferait gagner la vieille valeur
 * claire sur la neuve, et le retour arrière ressusciterait un IBAN périmé — sur
 * le compte où l'argent arrive.
 *
 * Aucun rattrapage n'est écrit ici : la colonne claire disparaîtra au palier 3,
 * et ce jour-là cette fonction se réduira à une lecture.
 */
function creditorIbanOf(row: LegalEntityRow, cipher: FieldCipher): string | null {
  if (row.creditorIbanSealed !== null && row.creditorIbanSealed !== "") {
    return cipher.open(row.creditorIbanSealed);
  }
  return row.creditorIban;
}

/** Agrégat → vue d'écran. */
export function toView(entity: LegalEntity, isLastActive: boolean): LegalEntityView {
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
    preNotificationDays: snapshot.preNotificationDays,
    mandateContractDescription: snapshot.mandateContractDescription,
    mandatePaymentType: snapshot.mandatePaymentType,
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
    firstMandateIssuedAt: row.firstMandateIssuedAt,
    preNotificationDays: row.preNotificationDays,
    mandateContractDescription: row.mandateContractDescription,
    mandatePaymentType: row.mandatePaymentType,
    logoKey: row.logoKey,
    archivedAt: row.archivedAt,
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
 */
export function legalEntityColumns(
  snapshot: LegalEntitySnapshot,
  cipher: FieldCipher,
): Omit<LegalEntitySnapshot, "id" | "creditorIban"> & {
  readonly creditorIbanSealed: string | null;
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
    creditorIbanSealed:
      snapshot.creditorIban === null || snapshot.creditorIban === ""
        ? null
        : cipher.seal(snapshot.creditorIban),
    creditorBic: snapshot.creditorBic,
    creditorAccountHolder: snapshot.creditorAccountHolder,
    creditorAccountLine1: snapshot.creditorAccountLine1,
    creditorAccountLine2: snapshot.creditorAccountLine2,
    creditorAccountPostalCode: snapshot.creditorAccountPostalCode,
    creditorAccountCity: snapshot.creditorAccountCity,
    creditorAccountCountryCode: snapshot.creditorAccountCountryCode,
    firstMandateIssuedAt: snapshot.firstMandateIssuedAt,
    preNotificationDays: snapshot.preNotificationDays,
    mandateContractDescription: snapshot.mandateContractDescription,
    mandatePaymentType: snapshot.mandatePaymentType,
    logoKey: snapshot.logoKey,
    archivedAt: snapshot.archivedAt,
  };
}
