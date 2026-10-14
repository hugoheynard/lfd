/**
 * Par où part une commande : sa tournée de livraison, ou le transfert interne
 * qui porte un retrait vers un site servi par transfert.
 */
export type OrderDepartureVia = "delivery" | "transfer";

/**
 * **Le départ d'une commande**, tel que la livraison le connaît maintenant.
 *
 * `at` est le départ PRÉVU de la tournée (`plannedDepartureAt`), sinon son
 * départ RÉEL (`departedAt`) — la règle du plan
 * `commandes/plan-tri-depart-et-couleurs.md`, §3. Une commande dont la tournée
 * n'a ni l'un ni l'autre n'a pas de départ : elle est absente de la réponse,
 * jamais datée d'une heure inventée.
 */
export interface OrderDeparture {
  readonly orderId: string;
  readonly at: Date;
  readonly via: OrderDepartureVia;
  /** La tournée est partie : `at` est un fait, plus une prévision. */
  readonly departed: boolean;
}

/**
 * **« Quand partent ces commandes ? »** — port que le colisage DÉCLARE et que
 * la livraison IMPLÉMENTE (lot L2, 2026-10-14), relié dans
 * `appBootstrap/packing-delivery-feed.module.ts`.
 *
 * Le poste de colisage range ce qui part le plus tôt d'abord : pour une
 * livraison, l'heure qui compte est le départ de sa tournée, pas la fenêtre
 * du client ; pour un retrait sur un site servi par transfert, le départ du
 * transfert. Ni l'un ni l'autre n'existe à la clôture du fournil (la
 * composition vient après) : c'est donc une LECTURE, à chaque ouverture du
 * poste, jamais une copie figée.
 *
 * Déclaré ici et non dans `delivery/channels/commerce/`, où le plan le
 * plaçait pour la liste des commandes : `packing → delivery` est interdit
 * (matrice du `CLAUDE.md`, §3), le colisage ne peut lire la livraison que par
 * un port qu'il publie.
 */
export abstract class OrderDeparturesReader {
  /** Par lot. Les commandes sans départ connu sont absentes. */
  abstract departuresOf(orderIds: readonly string[]): Promise<readonly OrderDeparture[]>;
}
