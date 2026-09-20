import { STAFF_RESOURCE_LABELS } from '@lfd/contracts';

import { domain, type ValueFamily } from './value-domain';

/**
 * **L'équipe** — l'annuaire staff et ses rôles (famille `team` du catalogue
 * des faits).
 */

export const STAFF_RESOURCE = domain('ressource du back-office', STAFF_RESOURCE_LABELS);

/**
 * Le niveau d'un droit. Les mêmes mots que les phrases de l'équipe
 * (`team-phrases.ts`, `ACTION_LABELS`), avec la majuscule d'une valeur isolée.
 */
export const STAFF_ACTION = domain('niveau d’accès', {
  read: 'Lecture',
  write: 'Écriture',
});

/** Une dérogation accorde ou refuse, contre ce que le rôle décide. */
export const OVERRIDE_EFFECT = domain('effet d’une dérogation', {
  allow: 'Accordé',
  deny: 'Refusé',
});

/** Les mêmes mots que la fiche d'un membre (`reglages-staff-users-page.ts`, vérifié le 2026-09-19). */
export const STAFF_IDENTITY_FIELD = domain('champ de la fiche d’un membre', {
  firstName: 'Prénom',
  lastName: 'Nom',
  email: 'Adresse e-mail',
  phone: 'Téléphone',
  jobTitle: 'Fonction',
});

/** Ce qu'un lien envoyé ouvre (`staff_user.invited`). */
export const INVITATION_KIND = domain('sorte de lien envoyé', {
  invitation: 'Invitation',
  password_reset: 'Nouveau mot de passe',
});

export const TEAM_VALUES: ValueFamily = {
  enums: [STAFF_RESOURCE, STAFF_ACTION, OVERRIDE_EFFECT, STAFF_IDENTITY_FIELD, INVITATION_KIND],
};
