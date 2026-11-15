/**
 * **Reprendre le tirage d'une journée** — absorber ce qui est arrivé depuis.
 *
 * L'auteur est obligatoire, et c'est tout ce qui sépare ce geste du recalcul
 * silencieux que l'agrégat refuse : sans nom, la reprise redeviendrait ce qu'on
 * interdit.
 *
 * Le handler rend un accusé (`{ date, absorbed, retakenAt }`) : combien de
 * commandes CE geste a absorbées — zéro compris, quand deux personnes ont
 * pressé le même bouton. Ce n'est pas un modèle de lecture ; l'exception est
 * écrite sur `CloseProductionDayCommand` (décision D2, 2026-11-02).
 */
export class RetakeProductionDayCommand {
  constructor(
    readonly serviceDay: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
