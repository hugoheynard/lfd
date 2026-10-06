/** **Fermer un jour** — le fournil ne produit pas ce jour-là (Q6). La date est jugée par le domaine. */
export class AddProductionClosedDayCommand {
  constructor(
    readonly serviceDay: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
