import type { ContainerRule } from "../../domain/services/production-worksheet.js";

/**
 * **Régler le contenant d'un produit** — « dix baguettes par tourneuse ».
 *
 * Pose ou remplace : il n'y a qu'un réglage par SKU, et le dernier est le vrai.
 * Aucune notion d'historique — ce réglage dit ce qui est vrai aujourd'hui au
 * four, pas ce qui a eu lieu.
 */
export class SetProductionContainerCommand {
  constructor(
    readonly sku: string,
    readonly rule: ContainerRule,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
