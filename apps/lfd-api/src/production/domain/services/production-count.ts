import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import type {
  DoneMark,
  ProducedItemSnapshot,
  ProductionOrderSnapshot,
} from "../entities/production-day.snapshot.js";

/**
 * **Le compte à produire, et la copie des commandes qu'il résume** — deux
 * calculs purs de la journée de fabrication.
 *
 * Ils ne lisent ni ne modifient l'état d'une journée : ils fabriquent ce que la
 * clôture et le retirage vont y inscrire. C'est ce qui les rend éprouvables
 * seuls, et ce qui les a fait sortir de `production-day.ts` le 2026-09-14.
 *
 * ⚠️ **Une seule fonction pour le tirage et le retirage**, et c'est l'invariant
 * qu'elle porte : un tirage et un retirage des mêmes commandes ne peuvent pas
 * compter différemment. Ne pas en écrire une seconde « pour le retirage ».
 */

/** La commande, recopiée telle qu'elle était — jamais une référence vers elle. */
export function freezeOrder(order: ProducibleOrder): ProductionOrderSnapshot {
  return {
    // Une journée qu'on vient d'arrêter n'a rien de colisé : le fournil n'a pas
    // encore commencé. L'écrire ici plutôt que de le laisser deviner évite qu'un
    // champ absent passe pour un bac fait.
    packed: null,
    // Personne n'a encore compté les bacs de cette commande. `0` le dit, et
    // c'est la même valeur qu'une commande dont on aurait dit « aucun » — la
    // distinction n'a pas de sens tant qu'on n'a rien chargé.
    containers: 0,
    orderId: order.orderId,
    reference: order.reference,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    destination: order.destination,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      // Une commande qu'on vient d'inscrire n'a rien au bac : le colisage n'a
      // pas commencé. Même geste que le `packed: null` de la commande juste
      // au-dessus, et pour la même raison — un champ absent passerait pour une
      // ligne déjà rangée.
      packed: null,
    })),
  };
}

/**
 * Le compte à produire, **trié par SKU**.
 *
 * Trié, et pas dans l'ordre d'arrivée des commandes : deux clôtures des mêmes
 * commandes doivent rendre le même compte, sans quoi le PDF qu'on en tire
 * cesserait d'être déterministe — et c'est la propriété sur laquelle repose son
 * rangement sans verrou.
 *
 * Le nom retenu est celui de la PREMIÈRE ligne rencontrée pour ce SKU. Deux
 * commandes d'une même journée portent le même catalogue ; si elles divergeaient,
 * c'est le SKU qui ferait foi, pas le libellé.
 */
export function countOf(
  orders: readonly ProducibleOrder[],
  /**
   * Ce qui était **déjà coché** avant, par SKU.
   *
   * 🔴 Un retirage ne décoche rien : le pain de seigle sorti du four à 5 h l'est
   * toujours quand la quantité passe de 30 à 42. Perdre la coche ferait
   * refabriquer ce qui est fait ; la garder laisse la ligne cochée sur une
   * quantité qui a monté — c'est le cas dangereux, et c'est précisément celui
   * que le bandeau nomme AVANT de proposer le geste.
   */
  done: ReadonlyMap<string, DoneMark> = new Map(),
): readonly ProducedItemSnapshot[] {
  const bySku = new Map<string, ProducedItemSnapshot>();
  for (const order of orders) {
    for (const line of order.lines) {
      const known = bySku.get(line.sku);
      bySku.set(line.sku, {
        sku: line.sku,
        productName: known?.productName ?? line.productName,
        quantity: (known?.quantity ?? 0) + line.quantity,
        done: done.get(line.sku) ?? null,
      });
    }
  }
  return [...bySku.values()].sort((left, right) => left.sku.localeCompare(right.sku));
}

/** Ce que le retirage inscrit dans la journée — ou rien, s'il n'y a rien à absorber. */
export interface AbsorbedArrivals {
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
  /** Le nombre de commandes réellement absorbées. `0` = rien n'était arrivé. */
  readonly count: number;
}

/**
 * **Ce que le retirage absorbe**, calculé sans toucher la journée.
 *
 * ## Ce qu'il absorbe, et ce qu'il ne touche pas
 *
 * Seules les commandes que la journée ne porte pas encore, **par `orderId`**.
 * C'est ce filtre qui rend le geste idempotent, et qui le protège du cas tordu :
 * la clôture publie un événement en processus, ni persisté ni rejoué, donc un
 * abonné en échec laisse des commandes `placed` DÉJÀ inscrites au plan. Sans le
 * filtre, un retirage les compterait une seconde fois.
 *
 * Les coches survivent, par SKU — cf. {@link countOf}.
 *
 * Le compte se refait depuis TOUTES les commandes de la journée, pas en ajoutant
 * les nouvelles au total précédent : c'est la même fonction qui produit le
 * tirage et le retirage, donc ils ne peuvent pas compter différemment.
 */
export function absorbArrivals(
  known: readonly ProductionOrderSnapshot[],
  counts: readonly ProducedItemSnapshot[],
  incoming: readonly ProducibleOrder[],
): AbsorbedArrivals {
  const knownIds = new Set(known.map((order) => order.orderId));
  const arrivals = incoming.filter((order) => !knownIds.has(order.orderId));
  if (arrivals.length === 0) {
    return { orders: known, counts, count: 0 };
  }
  const done = new Map(
    counts
      .filter((item): item is ProducedItemSnapshot & { done: DoneMark } => item.done !== null)
      .map((item) => [item.sku, item.done] as const),
  );
  const merged = [...known, ...arrivals.map(freezeOrder)];
  return {
    orders: merged,
    counts: countOf(
      merged.map((order) => ({
        orderId: order.orderId,
        reference: order.reference,
        customerLabel: order.customerLabel,
        fulfillmentMethod: order.fulfillmentMethod,
        destination: order.destination,
        lines: order.lines,
      })),
      done,
    ),
    count: arrivals.length,
  };
}
