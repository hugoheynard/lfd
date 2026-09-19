/**
 * **Archiver** — terminal, et le seul geste qui retire une règle de l'écran.
 *
 * Il n'y a pas de suppression : une règle a facturé, elle a fait un prix, et
 * l'effacer effacerait la réponse à « pourquoi ce prix » alors que la facture,
 * elle, reste.
 */
export class ArchivePriceRuleCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
