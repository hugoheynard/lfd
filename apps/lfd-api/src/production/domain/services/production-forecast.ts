import type { ProducedItemSnapshot } from "../entities/production-day.js";
import type { ServiceRange } from "../value-objects/service-range.value-object.js";

/**
 * Ce qu'une journée pèse, article par article — **quelle qu'en soit la source**.
 *
 * Même forme pour un compte à produire arrêté et pour une demande encore
 * ouverte, et c'est délibéré : la matrice n'a pas à savoir laquelle des deux
 * elle empile. Ce qu'elle doit savoir, en revanche, c'est **laquelle des deux
 * elle a lue** — d'où `closed`, qui suit la colonne jusqu'à l'écran.
 */
export interface DayDemand {
  /** `AAAA-MM-JJ`. */
  readonly day: string;
  readonly items: readonly ProducedItemSnapshot[];
  /**
   * Combien de **commandes** composent cette journée.
   *
   * Il vient de la source, il ne se déduit pas des articles : deux commandes
   * peuvent porter le même SKU, et le compte à produire les a justement
   * fusionnées. Le recalculer ici rendrait toujours le nombre de RÉFÉRENCES,
   * qui est une autre question.
   */
  readonly orderCount: number;
}

/** Une colonne de la matrice. */
export interface ForecastColumn {
  readonly date: string;
  readonly totalUnits: number;
  readonly orderCount: number;
  readonly closed: boolean;
}

/** Une ligne de la matrice : un produit, et son poids jour par jour. */
export interface ForecastRow {
  readonly sku: string;
  readonly productName: string;
  /** Même longueur que les colonnes, dans le même ordre. */
  readonly quantities: readonly number[];
  readonly totalUnits: number;
}

/** La matrice entière, telle que la lecture la rend. */
export interface ForecastMatrix {
  readonly columns: readonly ForecastColumn[];
  readonly rows: readonly ForecastRow[];
  readonly peakDate: string | null;
  readonly totalUnits: number;
}

/**
 * **La matrice `produits × jours`** — une fonction pure, et le cœur du
 * prévisionnel.
 *
 * ## La règle qui fait tout l'écran : le plan arrêté l'emporte
 *
 * 🔴 Une journée close ne se relit **pas** chez le commerce. À la clôture, ses
 * commandes quittent `placed`, donc la demande attendue y est vide — et une
 * matrice qui n'irait chercher que cette demande afficherait **zéro pour
 * aujourd'hui tous les matins**, puisque la journée du jour est close la veille
 * au soir. C'est le contraire exact de ce que l'écran existe pour montrer.
 *
 * Sur une journée close, la vérité est donc le **compte à produire arrêté** :
 * un instantané, un fait, celui sur lequel les fournées sont parties.
 *
 * ⚠️ **Et on n'y ajoute PAS les commandes tardives.** Une commande passée après
 * la clôture pour une journée close est légitimement `placed` — mais une
 * commande qu'un abonné défaillant a laissée derrière l'est aussi, et **rien ne
 * les distingue ici**. Les additionner ferait fabriquer deux fois dans le second
 * cas, ce qui est la plus coûteuse des deux erreurs possibles ; ne pas les
 * additionner fait manquer quelques pièces dans le premier, que le fournil voit
 * de toute façon arriver sur la feuille d'atelier du jour. La divergence, elle,
 * a déjà son compteur : `pendingInCommerce` sur l'état de la journée.
 *
 * ## Ce qui est déterministe, et pourquoi
 *
 * Les lignes sortent **triées par SKU** : deux lectures de la même plage rendent
 * la même grille, à la même place. Le nom retenu est celui du premier jour où le
 * produit apparaît ; si deux journées divergeaient, c'est le SKU qui fait foi.
 *
 * Le **pic** est le jour le plus chargé, et à égalité le plus proche : c'est
 * celui qui tombe le premier, donc celui qu'on prépare d'abord. `null` sur une
 * plage entièrement vide — un pic à zéro pièce désignerait un mur qui n'existe
 * pas.
 */
export function forecastMatrix(
  range: ServiceRange,
  arrested: readonly DayDemand[],
  expected: readonly DayDemand[],
): ForecastMatrix {
  const closed = new Set(arrested.map((day) => day.day));
  const demandOf = new Map<string, DayDemand>();
  for (const day of expected) {
    if (!closed.has(day.day)) {
      demandOf.set(day.day, day);
    }
  }
  for (const day of arrested) {
    demandOf.set(day.day, day);
  }

  const rows = new Map<string, { productName: string; quantities: number[] }>();
  const totals = Array.from({ length: range.length }, () => 0);

  range.days.forEach((day, column) => {
    for (const item of demandOf.get(day.value)?.items ?? []) {
      const row = rows.get(item.sku) ?? {
        productName: item.productName,
        quantities: Array.from({ length: range.length }, () => 0),
      };
      row.quantities[column] = (row.quantities[column] ?? 0) + item.quantity;
      rows.set(item.sku, row);
      totals[column] = (totals[column] ?? 0) + item.quantity;
    }
  });

  const columns = range.days.map((day, index) => ({
    date: day.value,
    totalUnits: totals[index] ?? 0,
    orderCount: demandOf.get(day.value)?.orderCount ?? 0,
    closed: closed.has(day.value),
  }));

  return {
    columns,
    rows: [...rows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sku, row]) => ({
        sku,
        productName: row.productName,
        quantities: row.quantities,
        totalUnits: row.quantities.reduce((sum, quantity) => sum + quantity, 0),
      })),
    peakDate: peakOf(columns),
    totalUnits: columns.reduce((sum, column) => sum + column.totalUnits, 0),
  };
}

/** Le jour le plus chargé ; à égalité le plus proche, et `null` si tout est vide. */
function peakOf(columns: readonly ForecastColumn[]): string | null {
  let peak: ForecastColumn | null = null;
  for (const column of columns) {
    if (column.totalUnits > 0 && (peak === null || column.totalUnits > peak.totalUnits)) {
      peak = column;
    }
  }
  return peak === null ? null : peak.date;
}
