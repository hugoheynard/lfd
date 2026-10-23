import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Le préfixe du numéro humain — celui que les anciens numéros portaient déjà. */
const ORDER_NUMBER_PREFIX = "ORD";

/** Un rang qui n'est pas un entier positif : le compteur a rendu autre chose qu'un rang. */
export class InvalidOrderNumberRankError extends TechnicalError {
  constructor(readonly rank: number) {
    super(
      "orders.order_number.invalid_rank",
      `Le compteur des numéros de commande a rendu ${rank}, qui n'est pas un rang : la commande n'est pas passée. Prévenir l'équipe technique.`,
    );
  }
}

/**
 * Le numéro humain d'une commande : `ORD-<n>` — `ORD-1`, `ORD-42`, `ORD-1042`
 * (plan `commandes/plan-numero-de-commande-court.md`, R1). Ni année ni zéros
 * devant : il se dit et se tape au comptoir. Il ne se confond pas avec un
 * ancien numéro, qui porte deux tirets (`ORD-MV84O2XA-Y9W3`).
 *
 * @throws {InvalidOrderNumberRankError} le rang n'est pas un entier ≥ 1.
 */
export function formatOrderNumber(rank: number): string {
  if (!Number.isSafeInteger(rank) || rank < 1) {
    throw new InvalidOrderNumberRankError(rank);
  }
  return `${ORDER_NUMBER_PREFIX}-${rank}`;
}
