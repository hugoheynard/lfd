/** **Créer un événement** — le popover « Créer un événement » (nom + date). */
export class DeclareEventCommand {
  constructor(
    readonly name: string,
    /** `AAAA-MM-JJ` — le domaine refuse une date qui n'existe pas. */
    readonly date: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé que l'écran a fabriquée pour ce geste : un envoi rejoué ne crée qu'un événement. */
    readonly intentKey: string,
  ) {}
}
