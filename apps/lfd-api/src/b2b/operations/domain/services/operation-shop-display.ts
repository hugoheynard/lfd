import type { OperationState } from "../value-objects/operation-schedule.js";

/** Ce que la boutique montre d'une opération, maintenant. */
export type OperationShopDisplay = "nothing" | "announcement_only" | "announcement_and_products";

/** Ce que la règle lit d'une opération. */
export interface ShopDisplayInput {
  readonly hidden: boolean;
  readonly archived: boolean;
  readonly state: OperationState;
  /** Combien d'articles de sa sélection sont en vente. */
  readonly sellingCount: number;
}

/** La réponse : ce que verra le client, et si l'encart attend ses produits. */
export interface ShopDisplay {
  readonly display: OperationShopDisplay;
  readonly awaitingProducts: boolean;
}

/**
 * **Ce que verra le client** (plan `plan-l-operation-passe-au-commerce.md`,
 * « Une opération sans article », Hugo 2026-10-15) — la règle que la boutique
 * applique (`shopOperationsOf`), dite pour l'écran du back-office :
 *
 * - masquée ou archivée, pas encore annoncée ou finie : rien ;
 * - pendant l'annonce : l'encart, même sans article ;
 * - commandes ouvertes sans article en vente : l'encart seul, qui dit « Les
 *   produits arrivent bientôt » — et l'écran avertit (probable oubli) ;
 * - commandes closes sans article : rien, il n'y a rien à retirer.
 *
 * L'écran juge « en vente » sur tout le catalogue ; la boutique, par
 * clientèle. Un article servi aux seuls pros compte ici, et ne paraît pas
 * chez les particuliers.
 */
export function shopDisplayOf(input: ShopDisplayInput): ShopDisplay {
  const nothing = { display: "nothing", awaitingProducts: false } as const;
  if (input.hidden || input.archived) {
    return nothing;
  }
  if (input.state === "preparing" || input.state === "ended") {
    return nothing;
  }
  if (input.sellingCount > 0) {
    return { display: "announcement_and_products", awaitingProducts: false };
  }
  if (input.state === "closed") {
    return nothing;
  }
  return { display: "announcement_only", awaitingProducts: input.state === "open" };
}
