import type { PresentQuantity } from "../../domain/services/problem-lines.js";

/**
 * **« Problème »** sur une commande à retirer, colisée au niveau simple (plan
 * des niveaux de suivi du colisage, D5) : ce qui est vraiment là, par SKU.
 * `intentKey` : la clé de l'écran — un double clic ne signale qu'une fois.
 */
export class ReportPackingProblemCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly present: readonly PresentQuantity[],
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
