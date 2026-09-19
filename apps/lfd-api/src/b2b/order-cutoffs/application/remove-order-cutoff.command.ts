/** Retire une règle d'heure limite. */
export class RemoveOrderCutoffCommand {
  constructor(readonly id: string) {}
}
