/** Le bac de cet envoi `(commande, rang)` s'est fermé complet : le manque est levé (lots E6a, LB). */
export class ClearOrderShortfallCommand {
  constructor(
    readonly reference: string,
    readonly rank: number,
    readonly clearedAt: Date,
  ) {}
}
