import type { CompanyMemberRole, CompanyView } from '@lfd/contracts';

/**
 * Les rôles qui éditent l'identité : ceux que l'API laisse écrire (vérifié le
 * 2026-09-14, `update-company-identity.handler.ts` refuse les autres en 403).
 * Aux autres, le panneau s'ouvre en lecture — un « Modifier » qui finirait en
 * refus se lirait comme une panne.
 */
const IDENTITY_EDIT_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'admin']);

/** Lu par les deux cartes et par l'ouverture du panneau : une seule règle. */
export function canEditIdentity(company: CompanyView | null): boolean {
  return company !== null && IDENTITY_EDIT_ROLES.has(company.role);
}
