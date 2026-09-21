import type { CompanyMemberRole, CompanyView, FulfillmentPreferenceView } from '@lfd/contracts';

/**
 * Les rôles qui posent l'habitude de service : ceux que l'API laisse écrire
 * (vérifié le 2026-09-14, `prefer-fulfillment.handler.ts` → `ensureCompanyAdmin`).
 */
const PREFERENCE_WRITE_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'admin']);

/** Lu par la carte bureau et par l'ouverture du panneau : une seule règle. */
export function canEditPreferences(company: CompanyView | null): boolean {
  return company !== null && PREFERENCE_WRITE_ROLES.has(company.role);
}

/** Deux préférences disent-elles la même chose ? Arme Enregistrer. */
export function samePreference(
  a: FulfillmentPreferenceView,
  b: FulfillmentPreferenceView,
): boolean {
  return (
    a.method === b.method &&
    a.pickupAddressId === b.pickupAddressId &&
    a.deliveryAddressId === b.deliveryAddressId &&
    a.signatureRequired === b.signatureRequired
  );
}
