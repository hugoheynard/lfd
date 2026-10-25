import type { CustomerCancellationStage } from "@lfd/contracts";

/**
 * **Jusqu'où l'annulation peut aller pour cette commande** (plan
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * décision C7 § 4) : avant l'inscription au compte à produire, ou — commande
 * personnelle, réglage `ready` — jusqu'à ce que le colisage l'ait fermée.
 *
 * Calculée UNE fois par le noyau `OrderCancellation`, pour tout acteur : le
 * staff suit la limite du particulier (décision 6 de C7), et un pro n'est
 * jamais concerné.
 */
export interface CancellationAllowance {
  readonly allowance: "before_inscription" | "before_packing";
}

/** La règle d'avant A1, et celle de toute commande de société. */
export const BEFORE_INSCRIPTION: CancellationAllowance = { allowance: "before_inscription" };

/** `before_packing` si la commande est personnelle ET que le réglage dit `ready`. */
export function cancellationAllowanceOf(
  companyId: string | null,
  stage: CustomerCancellationStage,
): CancellationAllowance {
  if (companyId === null && stage === "ready") {
    return { allowance: "before_packing" };
  }
  return BEFORE_INSCRIPTION;
}
