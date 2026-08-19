/** Retire un code NAF ciblé de la config marché. */
export class RemoveMarketNafCommand {
  constructor(readonly code: string) {}
}
