import type { LegalEntityView } from "@lfd/contracts";

import type { LegalEntity as LegalEntityRow } from "../../../platform/database/client/client.js";
import { LegalEntity, type LegalEntitySnapshot } from "../domain/entities/legal-entity.js";

/**
 * Ligne → agrégat. Les value objects **revalident** au passage : une ligne écrite
 * par une main tierce (script, correction en SQL) est refusée à la relecture
 * plutôt que promenée dans le domaine.
 */
export function toDomain(row: LegalEntityRow): LegalEntity {
  return LegalEntity.reconstitute(toSnapshot(row));
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
    preNotificationDays: snapshot.preNotificationDays,
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
function toSnapshot(row: LegalEntityRow): LegalEntitySnapshot {
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
    creditorIban: row.creditorIban,
    preNotificationDays: row.preNotificationDays,
    logoKey: row.logoKey,
    archivedAt: row.archivedAt,
  };
}
