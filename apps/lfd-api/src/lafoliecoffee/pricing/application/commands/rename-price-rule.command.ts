/**
 * **Renommer une règle** — le libellé, et rien d'autre.
 *
 * Il n'existe volontairement aucune commande qui remplacerait l'effet, la
 * portée ou la fenêtre : les changer sur une règle qui a déjà facturé
 * réécrirait l'explication de factures déjà payées. Archiver-et-reposer laisse
 * les deux décisions visibles.
 */
export class RenamePriceRuleCommand {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly staffUserId: string,
  ) {}
}
