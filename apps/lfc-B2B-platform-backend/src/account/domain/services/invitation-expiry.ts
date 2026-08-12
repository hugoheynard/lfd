/**
 * Combien de temps une **invitation** reste valable.
 *
 * Ce n'est pas une contrainte qu'on invente : le lien de mot de passe du
 * fournisseur d'identité a **déjà** une durée de vie limitée. Une invitation qui
 * traîne trois semaines est donc déjà morte — simplement, rien ne le disait, et
 * la fiche affichait « invité » sur un accès que plus personne ne pouvait
 * réclamer.
 *
 * Quatorze jours : assez pour couvrir des congés ou un e-mail lu en retard,
 * assez court pour qu'une adresse invitée par erreur cesse vite de porter un
 * droit.
 */
export const INVITATION_LIFETIME_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jusqu'à quand cette invitation vaut. */
export function invitationExpiresAt(attachedAt: Date): Date {
  return new Date(attachedAt.getTime() + INVITATION_LIFETIME_DAYS * DAY_MS);
}

/**
 * L'invitation est-elle **périmée** ?
 *
 * Fonction **pure**, et c'est ce qui compte ici : la même règle sert deux
 * endroits — l'écran, qui doit dire la vérité entre deux balayages, et le
 * balayage, qui révoque pour de bon. Écrite deux fois, elle finirait par donner
 * deux réponses, et l'une des deux serait celle qu'on ne teste jamais.
 *
 * La borne est **inclusive côté vie** : à la seconde exacte, l'invitation vaut
 * encore. Un compte ne se ferme pas sur une égalité de millisecondes.
 */
export function isInvitationExpired(attachedAt: Date, now: Date): boolean {
  return now.getTime() > invitationExpiresAt(attachedAt).getTime();
}
