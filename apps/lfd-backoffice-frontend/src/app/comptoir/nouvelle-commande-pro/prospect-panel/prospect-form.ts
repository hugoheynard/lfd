/** Ce que la commerciale tape pour une enseigne qui n'est pas encore cliente. */
export interface ProspectDraft {
  readonly enseigne: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

/** Une forme d'adresse, dite avant l'envoi ; le serveur reste juge. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ce qui empêche la création, en clair, ou `''`. L'enseigne, le prénom,
 * l'e-mail et le téléphone sont obligatoires : c'est par l'e-mail que le
 * contact sera retrouvé le jour où on lui remettra son accès, sans doublon.
 */
export function prospectIssue(draft: ProspectDraft): string {
  if (draft.enseigne.trim() === '') {
    return 'Indiquez le nom de l’enseigne.';
  }
  if (draft.firstName.trim() === '') {
    return 'Indiquez le prénom du contact.';
  }
  if (!EMAIL_SHAPE.test(draft.email.trim())) {
    return 'Indiquez une adresse e-mail valide pour le contact.';
  }
  if (draft.phone.trim() === '') {
    return 'Indiquez le téléphone du contact.';
  }
  return '';
}
