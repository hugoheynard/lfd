/** Le bac de cette commande s'est fermé complet : le manque est levé (lot E6a). */
export class ClearOrderShortfallCommand {
  constructor(
    readonly reference: string,
    readonly clearedAt: Date,
  ) {}
}
