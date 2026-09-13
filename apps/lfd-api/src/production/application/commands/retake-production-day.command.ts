/**
 * **Reprendre le tirage d'une journée** — absorber ce qui est arrivé depuis.
 *
 * L'auteur est obligatoire, et c'est tout ce qui sépare ce geste du recalcul
 * silencieux que l'agrégat refuse : sans nom, la reprise redeviendrait ce qu'on
 * interdit.
 */
export class RetakeProductionDayCommand {
  constructor(
    readonly serviceDay: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffSubject: string,
  ) {}
}
