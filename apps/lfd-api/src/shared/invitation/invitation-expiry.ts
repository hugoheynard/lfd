/**
 * Combien de temps une **invitation** reste valable — la règle, pour tout le
 * monde.
 *
 * Ce n'est pas une contrainte qu'on invente : le lien de mot de passe du
 * fournisseur d'identité a **déjà** une durée de vie limitée. Une invitation qui
 * traîne trois semaines est donc déjà morte — simplement, rien ne le disait, et
 * la fiche affichait « invitée » sur un accès que plus personne ne pouvait
 * réclamer.
 *
 * Quatorze jours : assez pour couvrir des congés ou un e-mail lu en retard,
 * assez court pour qu'une adresse invitée par erreur cesse vite de porter un
 * droit.
 *
 * Elle vit dans `shared/` parce qu'elle a **deux** usagers — le contact d'une
 * société cliente et le membre de l'équipe — et qu'ils n'ont aucune raison de
 * s'accorder par hasard sur le même nombre de jours. Une invitation périmée doit
 * l'être partout le même jour, ou « périmée » ne veut plus rien dire.
 */
export const INVITATION_LIFETIME_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jusqu'à quand cette invitation vaut. */
export function invitationExpiresAt(invitedAt: Date): Date {
  return new Date(invitedAt.getTime() + INVITATION_LIFETIME_DAYS * DAY_MS);
}

/**
 * L'invitation est-elle **périmée** ?
 *
 * Fonction **pure**, et c'est ce qui compte ici : la même règle sert deux
 * moments — l'écran, qui doit dire la vérité entre deux balayages, et le
 * balayage, qui révoque pour de bon. Écrite deux fois, elle finirait par donner
 * deux réponses, et l'une des deux serait celle qu'on ne teste jamais.
 *
 * La borne est **inclusive côté vie** : à la milliseconde exacte, l'invitation
 * vaut encore. Un accès ne se ferme pas sur une égalité d'horloge.
 */
export function isInvitationExpired(invitedAt: Date, now: Date): boolean {
  return now.getTime() > invitationExpiresAt(invitedAt).getTime();
}
