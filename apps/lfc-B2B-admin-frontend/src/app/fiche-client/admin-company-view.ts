import {
  formatSiret,
  type CompanyBadgeTone,
  type CompanyContactCardView,
  type CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import { STATUS_LABELS, type AdminCompany, type CompanyStatus } from '../comptes-clients/admin-company';

/** Ton du badge de statut admin — `terminated` en plus du client. */
const STATUS_TONE: Readonly<Record<CompanyStatus, CompanyBadgeTone>> = {
  active: 'success',
  pending: 'warning',
  suspended: 'alert',
  terminated: 'neutral',
};

/**
 * Projette une `AdminCompany` (vue staff, cross-tenant) vers le view-model neutre
 * d'identité de `@lfd/b2b-ui/company`. Deux différences avec le client, portées
 * par les données (jamais par un `isAdmin`) : le staff n'est pas membre → aucun
 * badge de rôle ; pas de `vatNumberRequired` → on ne signale pas la TVA manquante.
 */
export function toIdentityView(company: AdminCompany): CompanyIdentityView {
  return {
    raisonSociale: company.raisonSociale,
    enseigne: company.enseigne,
    formeJuridique: company.formeJuridique,
    siret: formatSiret(company.siret),
    tvaIntracom: company.tvaIntracom,
    tvaMissing: false,
    statusLabel: STATUS_LABELS[company.status],
    statusTone: STATUS_TONE[company.status],
    roleLabel: null,
    kbis: company.kbis,
  };
}

/**
 * Le contact principal de la société, en carte **lecture seule**. L'admin ne
 * lit (pour l'instant) que ce contact ; `isYou` est toujours faux — le staff
 * n'est pas un interlocuteur de la société.
 */
export function toContactCards(company: AdminCompany): CompanyContactCardView[] {
  return [
    {
      contactId: company.primaryContact.id,
      firstName: company.primaryContact.firstName,
      lastName: company.primaryContact.lastName,
      role: 'Contact principal',
      fonction: company.primaryContact.fonction,
      email: company.primaryContact.email,
      phone: company.primaryContact.phone,
      isPrimary: true,
      isYou: false,
    },
  ];
}
