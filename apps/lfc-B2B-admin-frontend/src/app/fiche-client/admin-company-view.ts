import {
  formatSiret,
  type CompanyBadgeTone,
  type CompanyContactCardView,
  type CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import {
  STATUS_LABELS,
  type AdminCompany,
  type AdminCompanyDetail,
  type CompanyStatus,
} from '../comptes-clients/admin-company';

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
 * Le **détenteur du compte**, en carte.
 *
 * « Contact principal » et « détenteur » désignaient la même personne sous deux
 * noms : celui qu'on rappelle est celui qui se connecte. La carte porte
 * désormais le rôle réel. `isYou` reste faux — le staff n'est pas un
 * interlocuteur de la société ; la pastille « Vous » n'a de sens que côté
 * client, où elle distingue le lecteur des autres.
 */
export function toContactCards(company: AdminCompanyDetail): CompanyContactCardView[] {
  const primary: CompanyContactCardView = {
    contactId: company.primaryContact.id,
    firstName: company.primaryContact.firstName,
    lastName: company.primaryContact.lastName,
    role: 'Détenteur du compte',
    fonction: company.primaryContact.fonction,
    email: company.primaryContact.email,
    phone: company.primaryContact.phone,
    isPrimary: true,
    isYou: false,
  };
  const others = company.contacts.map<CompanyContactCardView>((contact) => ({
    contactId: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    role: contact.fonction === '' ? 'Contact' : contact.fonction,
    fonction: contact.fonction,
    email: contact.email,
    phone: contact.phone,
    isPrimary: false,
    isYou: false,
  }));
  return [primary, ...others];
}
