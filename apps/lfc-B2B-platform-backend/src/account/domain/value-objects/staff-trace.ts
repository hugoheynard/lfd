/**
 * **Qui** a posé un acte staff, et à quel titre — figé à l'instant de l'acte.
 *
 * Le `sub` est l'identifiant qui survit à tout (changement de nom, de périmètre,
 * départ) ; `name` et `role` sont un **instantané**, pas une jointure. Une trace
 * répond à « qui a engagé sa parole ce jour-là », jamais à « qui porte ce rôle
 * aujourd'hui » — les résoudre à la lecture ferait changer l'histoire.
 *
 * Vides quand l'annuaire staff ne connaît pas le `sub` : on n'invente pas un nom,
 * et un identifiant technique au milieu d'une phrase n'apprend rien à personne.
 */
export interface StaffTrace {
  readonly sub: string;
  readonly name: string;
  readonly role: string;
}
