import { COMPANY_ROLE_LABELS, type CompanyMemberRole } from '@lfd/contracts';
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
    // Ce qui manque au greffe — la même liste que la synthèse du haut de page,
    // répétée là où on la corrige.
    missingLegal: missingLegalOf(company),
    statusLabel: STATUS_LABELS[company.status],
    statusTone: STATUS_TONE[company.status],
    roleLabel: null,
    kbis: company.kbis,
  };
}

/**
 * Les interlocuteurs de la société, en cartes — **détenteur compris**.
 *
 * Une seule liste, parce que la fiche en rend une seule : l'accès n'est pas une
 * catégorie de personnes, c'est un état de chacune. `isYou` reste faux — le
 * staff n'est pas un interlocuteur de la société ; la pastille « Vous » n'a de
 * sens que côté client, où elle distingue le lecteur des autres.
 */
export function toContactCards(company: AdminCompanyDetail): CompanyContactCardView[] {
  return company.contacts.map((contact) => ({
    contactId: contact.contactId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    role: roleLabel(contact.role),
    fonction: contact.fonction,
    email: contact.email,
    phone: contact.phone,
    // Le détenteur n'a pas d'identifiant de contact : il vit aplati sur la
    // société, et ne se supprime donc pas comme une ligne du carnet.
    isPrimary: contact.contactId === null,
    isYou: false,
    access: contact.access,
    emailVerified: contact.emailVerified,
  }));
}

/**
 * Le rôle en clair. `null` se dit **« à préciser »** et non « Contact » : c'est
 * une donnée qui manque, pas une catégorie — et l'afficher comme un rôle
 * ordinaire la rendrait invisible à celui qui doit la compléter.
 */
function roleLabel(role: CompanyMemberRole | null): string {
  return role === null ? 'Rôle à préciser' : COMPANY_ROLE_LABELS[role];
}

/** Les pièces d'identité légale absentes, nommées pour être lues. */
function missingLegalOf(company: AdminCompany): readonly string[] {
  const missing: string[] = [];
  if (company.raisonSociale.trim() === '') {
    missing.push('la raison sociale');
  }
  if (company.formeJuridique.trim() === '') {
    missing.push('la forme juridique');
  }
  if (company.siret.trim() === '') {
    missing.push('le SIRET');
  }
  return missing;
}
