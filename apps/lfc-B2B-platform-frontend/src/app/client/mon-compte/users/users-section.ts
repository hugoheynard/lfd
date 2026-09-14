import { COMPANY_ROLE_LABELS, type CompanyView, type ContactView } from '@lfd/contracts';

import { canManageCompany } from '../../../account/account.model';

/**
 * Le nom affichable d'un interlocuteur, ou son **e-mail** à défaut : prénom et
 * nom sont facultatifs au modèle, et c'est par l'adresse qu'on le joint. Un
 * nom vide laisserait une ligne muette.
 */
export function nameOf(contact: ContactView): string {
  const full = `${contact.firstName} ${contact.lastName}`.trim();
  return full === '' ? contact.email : full;
}

/** Les initiales, dérivées du nom affiché. Une lettre suffit quand il n'y en a qu'un. */
export function initialsOf(contact: ContactView): string {
  return nameOf(contact)
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** La sous-ligne d'un contact : la fonction ET le rôle — « Comptabilité · Facturation ». */
export function contactLine(contact: ContactView): string {
  const role = contact.role === null ? '' : COMPANY_ROLE_LABELS[contact.role];
  return [contact.fonction, role].filter((part) => part !== '').join(' · ');
}

/** Détenteur compris : c'est un interlocuteur comme les autres, le premier. */
export function contactCount(company: CompanyView | null): number {
  return company === null ? 0 : company.contacts.length + 1;
}

/**
 * `owner`/`admin` : ceux que l'API laisse ajouter un contact
 * (`add-company-contact.handler.ts` → `ensureCompanyAdmin`, vérifié le
 * 2026-09-14). Aux autres, pas de bouton qui finirait en refus.
 */
export function canAddContacts(company: CompanyView | null): boolean {
  return company !== null && canManageCompany(company.role);
}
