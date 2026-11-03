/**
 * **D'où vient la marchandise d'une commande** (plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`).
 *
 * - `planned` : fabriquée pour elle — elle entre au plan du fournil, au
 *   transfert, aux échéances du four. Toute commande d'avant la marque.
 * - `shelf` : prise dans le stock du jour de la vitrine de son point — un
 *   retrait d'aujourd'hui, qu'aucun lecteur de production ni de transport ne
 *   voit (`notFromStock`, `plan-filter.ts`).
 *
 * Ce n'est ni un mode d'acheminement (elle reste un `pickup` pour la file du
 * comptoir, la remise, le BL et la facture) ni `placedOffPlan`, qui n'est
 * qu'un badge. Figée à la passation : l'agrégat n'a aucun setter.
 */
export const ORDER_SUPPLIES = ["planned", "shelf"] as const;

export type OrderSupply = (typeof ORDER_SUPPLIES)[number];

/**
 * **Le raccourci de saisie** qui a posé la commande — `immediate_pickup` est le
 * « Retrait immédiat » du comptoir (§1, §5). Une trace pour compter, croisée
 * avec la clientèle figée ; il ne décide de rien.
 */
export const ORDER_ENTRY_SHORTCUTS = ["immediate_pickup"] as const;

export type OrderEntryShortcut = (typeof ORDER_ENTRY_SHORTCUTS)[number];

/**
 * **D'où vient la saisie de l'équipe** (Hugo, 2026-11-03, E4 étendu) :
 * `counter` est le comptoir, qu'il prenne sur la vitrine ou programme. Absent,
 * la saisie du commercial. Le serveur ne la garde pas : elle ne décide que du
 * règlement admis.
 */
export const ORDER_ENTRY_ORIGINS = ["counter"] as const;

export type OrderEntryOrigin = (typeof ORDER_ENTRY_ORIGINS)[number];

/**
 * **La marque décidée par l'appelant**, telle que `Order.draft` la reçoit.
 *
 * Une commande `shelf` porte « aujourd'hui » (`AAAA-MM-JJ`) tel que
 * l'appelant l'a lu à son horloge : l'agrégat compare, il ne lit jamais
 * l'heure (comme `Company.activate`). Le raccourci n'existe que sur une
 * `shelf` — un « Retrait immédiat » est toujours pris en vitrine (§5) ; la
 * forme le rend inexprimable ailleurs, et le CHECK
 * `orders_entry_shortcut_on_shelf` le tient en base.
 */
export type OrderSupplyDecision =
  | { readonly supply: "planned" }
  | {
      readonly supply: "shelf";
      readonly today: string;
      readonly entryShortcut: OrderEntryShortcut | null;
    };

/** La marque telle que la commande la porte et la rend — sans « aujourd'hui ». */
export interface OrderSupplyMark {
  readonly supply: OrderSupply;
  readonly entryShortcut: OrderEntryShortcut | null;
}

/** Le comportement d'avant la marque : fabriquée pour elle. */
export const PLANNED_SUPPLY: OrderSupplyDecision = { supply: "planned" };

/** La marque d'une décision, sans le jour qui n'a servi qu'à la juger. */
export function supplyMarkOf(decision: OrderSupplyDecision): OrderSupplyMark {
  return decision.supply === "shelf"
    ? { supply: "shelf", entryShortcut: decision.entryShortcut }
    : { supply: "planned", entryShortcut: null };
}
