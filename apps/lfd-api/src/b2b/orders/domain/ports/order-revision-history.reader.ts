import type { OrderRevisionChange, ReplacedCompositionView } from "@lfd/contracts";

/**
 * Une modification telle que l'historique la garde (`public.order_revision`).
 * L'auteur staff est la fiche (`staffId`), nommée par l'annuaire du staff ; le
 * client est nommé par l'adaptateur, qui lit son propre bloc.
 */
export interface RecordedOrderRevision {
  readonly replacedRevision: number;
  readonly revisedAt: Date;
  readonly author:
    | { readonly kind: "customer"; readonly name: string | null }
    | { readonly kind: "staff"; readonly staffId: string | null };
  readonly changes: readonly OrderRevisionChange[];
  readonly totalBeforeCents: number;
  readonly totalAfterCents: number;
  /** `null` : le JSON de la composition ne se relit pas. */
  readonly replaced: ReplacedCompositionView | null;
}

/**
 * Port de **lecture** des versions précédentes d'une commande (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §6, M3) — la plus
 * récente en tête. Séparé du port d'écriture de la révision (ISP) : seul le
 * détail staff le lit.
 *
 * `null` = la commande n'existe pas ; une commande jamais modifiée rend `[]`.
 */
export abstract class OrderRevisionHistoryReader {
  abstract historyOf(orderId: string): Promise<readonly RecordedOrderRevision[] | null>;
}
