/** **Retirer** une formule : elle ne se modifie plus, sa clé reste prise. */
export class WithdrawBundleCommand {
  constructor(
    readonly key: string,
    readonly writtenBy: string | null,
  ) {}
}
