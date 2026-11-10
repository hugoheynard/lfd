/**
 * **Qui** a posé un acte staff, et à quel titre — figé à l'instant de l'acte.
 *
 * `staffUserId` est l'id de la **fiche** d'annuaire : l'identifiant qui survit à
 * tout (changement de nom, de périmètre, d'identifiant de connexion, départ) ;
 * `name` et `role` sont un **instantané**, pas une jointure. Une trace répond à
 * « qui a engagé sa parole ce jour-là », jamais à « qui porte ce rôle
 * aujourd'hui » — les résoudre à la lecture ferait changer l'histoire.
 *
 * Les traces écrites avant le 2026-09-18 portent encore un `sub` Auth0 dans ce
 * champ, jusqu'à leur conversion (plan de l'auteur, étape 4) : les lecteurs de
 * nom acceptent les deux formes.
 *
 * Vides quand l'annuaire staff ne connaît pas l'auteur : on n'invente pas un
 * nom, et un identifiant technique au milieu d'une phrase n'apprend rien à
 * personne.
 */
export interface StaffTrace {
  readonly staffUserId: string;
  readonly name: string;
  readonly role: string;
}
