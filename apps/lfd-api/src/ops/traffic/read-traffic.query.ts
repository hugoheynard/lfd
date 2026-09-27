/**
 * Requête **staff** : ce que la gateway a vu passer sur une fenêtre glissante.
 *
 * `minutes` reste la saisie brute de l'appelant : la borner est une décision
 * de lecture ({@link resolveWindowMinutes}), pas une validation de forme.
 */
export class ReadTrafficQuery {
  constructor(readonly minutes: string | undefined) {}
}
