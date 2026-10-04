/**
 * **Le colisable** — ce qui peut aller au bac, calculé à la lecture (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §12.2, §13).
 *
 * Le stock d'un article est attribué aux commandes **par échéance croissante**,
 * la plus proche d'abord ; une commande sans échéance passe **en dernier**. Une
 * ligne est colisable quand ce qui lui est attribué couvre sa quantité.
 *
 * ## L'attribution est stricte, et c'est voulu
 *
 * La première ligne prend ce qu'il reste, même si ça ne la couvre pas ; les
 * suivantes n'ont alors plus rien. Une commande plus tardive ne passe jamais
 * devant une plus proche faute de place : c'est l'échéance qui mène (plan des
 * vagues, §7.2), pas le premier qui tient dans le bac.
 *
 * À échéance égale, la référence puis l'identifiant départagent : deux
 * lectures du même état rendent le même colisable.
 *
 * Fonction pure : ni horloge, ni base. Les deux côtés de la comparaison de
 * l'ombre (K1) passent par elle — l'écart mesuré est donc celui des DONNÉES,
 * jamais celui de deux règles.
 */

/** Une commande, réduite à ce qui décide de l'attribution. */
export interface PackableOrder {
  readonly orderId: string;
  readonly reference: string;
  /** `HH:mm` sur la journée ; `null` = aucune échéance, en dernier. */
  readonly dueAt: string | null;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

/** Une ligne (commande × article), et le verdict. */
export interface PackableLine {
  readonly orderId: string;
  readonly reference: string;
  readonly sku: string;
  /** La quantité due, lignes du même article d'une commande additionnées. */
  readonly quantity: number;
  /** Ce que l'attribution lui donne, jamais plus que `quantity`. */
  readonly allocated: number;
  readonly packable: boolean;
}

/**
 * Le colisable de chaque ligne, dans l'ordre d'attribution.
 *
 * @param available le stock par SKU — reçu − rendu côté colisage, sorti du
 *   four côté fournil. Un SKU absent vaut zéro ; un stock négatif aussi.
 */
export function packableLines(
  orders: readonly PackableOrder[],
  available: ReadonlyMap<string, number>,
): readonly PackableLine[] {
  const left = new Map<string, number>();
  const lines: PackableLine[] = [];
  for (const order of [...orders].sort(byDueThenReference)) {
    for (const [sku, quantity] of quantitiesBySku(order)) {
      const stock = left.get(sku) ?? Math.max(0, available.get(sku) ?? 0);
      const allocated = Math.min(stock, quantity);
      left.set(sku, stock - allocated);
      lines.push({
        orderId: order.orderId,
        reference: order.reference,
        sku,
        quantity,
        allocated,
        packable: allocated === quantity,
      });
    }
  }
  return lines;
}

/** Les lignes d'une commande, additionnées par article, triées par SKU. */
function quantitiesBySku(order: PackableOrder): readonly [string, number][] {
  const bySku = new Map<string, number>();
  for (const line of order.lines) {
    bySku.set(line.sku, (bySku.get(line.sku) ?? 0) + line.quantity);
  }
  return [...bySku.entries()].sort(([a], [b]) => compareText(a, b));
}

function byDueThenReference(left: PackableOrder, right: PackableOrder): number {
  if (left.dueAt !== right.dueAt) {
    if (left.dueAt === null) {
      return 1;
    }
    if (right.dueAt === null) {
      return -1;
    }
    return compareText(left.dueAt, right.dueAt);
  }
  return compareText(left.reference, right.reference) || compareText(left.orderId, right.orderId);
}

/** Ordre binaire, indépendant de la locale : `HH:mm` s'y trie chronologiquement. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
