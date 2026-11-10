import type { CounterReachRefusal } from "../../domain/services/counter-reach.js";

/**
 * L'aperçu du retrait pour un départ décidé au comptoir : ouvert, hors de
 * portée (une livraison, un autre jour), ou refusé par la règle de remise —
 * avec la phrase du retrait, puisque ses cas sont nombreux (annulée, déjà
 * retirée, non réglée, retenue, transfert non reçu…).
 */
export type CounterHandoverPreview =
  | { readonly kind: "open" }
  | { readonly kind: "out_of_reach"; readonly refusal: CounterReachRefusal }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * **« Le comptoir peut-il remettre cette commande ? »** — sans rien écrire
 * ni verrouiller (lot C1b, plan
 * `documentation/commandes/reliquat/depart-incomplet.md`, §4.1 —
 * Hugo, 2026-11-03). Déclaré ET implémenté par le retrait, lu par le
 * commerce ; à part de {@link CounterHandoverDesk} (ISP) : une lecture ne
 * dépend pas d'un geste. Les mêmes règles que `CounterHandoverDesk.vet` —
 * la garde du comptoir, puis celle de la remise —, lues au lieu d'être
 * levées. Un aperçu : le geste rejuge sous le verrou de la commande.
 */
export abstract class CounterHandoverPreviewReader {
  /** Une commande que le retrait ne connaît pas est refusée, comme au geste. */
  abstract previewOf(orderId: string): Promise<CounterHandoverPreview>;
}
