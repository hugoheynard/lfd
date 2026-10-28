import { pieceTally, saleQuantity, type SaleUnit } from "@lfd/money";

import type { ServiceRange } from "../value-objects/service-range.value-object.js";

/**
 * Un article et son poids, pour un mur de planning.
 *
 * ⚠️ **Il ne réutilise plus `ProducedItemSnapshot`**, et c'est un resserrement,
 * pas une duplication (2026-09-13). Depuis que le compte à produire porte la
 * COCHE du fournil, ce type-là dit deux choses : ce qu'il y a à fabriquer, et
 * ce qui est déjà sorti. Le prévisionnel ne sait rien de la seconde et n'a rien
 * à en faire — une demande encore ouverte n'a personne pour la cocher. Le lui
 * servir obligeait à poser un `done: null` dans chaque lecture, c'est-à-dire à
 * inventer « pas fait » pour des journées qui n'ont même pas de tirage.
 */
export interface DemandItem {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"` (P6). */
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

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
  readonly items: readonly DemandItem[];
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

/** Les réassorts « pour demain » d'une journée, article par article. */
export interface DayResupplyDemand {
  /** `AAAA-MM-JJ`. */
  readonly day: string;
  readonly items: readonly DemandItem[];
}

/**
 * Les réassorts de la plage, par source (lot R3d, 2026-10-21) : `arrested`
 * sont les réassorts FIGÉS à l'arrêt — déjà comptés dans le compte à
 * produire, la matrice n'en tire que la part ; `expected` sont ceux d'une
 * journée encore ouverte, que la matrice ajoute à la demande.
 */
export interface ForecastResupplies {
  readonly arrested: readonly DayResupplyDemand[];
  readonly expected: readonly DayResupplyDemand[];
}

const NO_RESUPPLIES: ForecastResupplies = { arrested: [], expected: [] };

/** Une colonne de la matrice. */
export interface ForecastColumn {
  readonly date: string;
  /** Des pièces : un article au poids y compte pour un, jamais ses grammes (P6). */
  readonly totalUnits: number;
  /** La part des réassorts dans `totalUnits` — jamais en plus. */
  readonly resupplyUnits: number;
  readonly orderCount: number;
  readonly closed: boolean;
}

/** Une ligne de la matrice : un produit, et son poids jour par jour. */
export interface ForecastRow {
  readonly sku: string;
  readonly productName: string;
  /**
   * L'unité de l'article (P6) : ses `quantities` et son `totalUnits` sont des
   * grammes si `weight` — une ligne n'a qu'un article, la somme est homogène.
   */
  readonly saleUnit: SaleUnit;
  /** Même longueur que les colonnes, dans le même ordre. */
  readonly quantities: readonly number[];
  /** La part des réassorts dans `quantities`, colonne par colonne. */
  readonly resupplyQuantities: readonly number[];
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
 *
 * ## Les réassorts (lot R3d, 2026-10-21)
 *
 * Même arbitrage que les commandes : une journée close prend ses réassorts
 * FIGÉS, qui sont déjà dans son compte à produire (R3a) — la matrice n'en
 * tire que la part, pour la distinguer ; une journée ouverte prend les
 * réassorts envoyés, et les AJOUTE à sa demande. Le compte de commandes
 * n'en dit rien.
 */
export function forecastMatrix(
  range: ServiceRange,
  arrested: readonly DayDemand[],
  expected: readonly DayDemand[],
  resupplies: ForecastResupplies = NO_RESUPPLIES,
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
  const resupplyOf = resuppliesByDay(closed, resupplies);

  const grid = new Grid(range.length);
  range.days.forEach((day, column) => {
    for (const item of demandOf.get(day.value)?.items ?? []) {
      grid.add(column, item, false);
    }
    for (const item of resupplyOf.get(day.value) ?? []) {
      // Une journée close a déjà ses réassorts dans son compte : on n'en marque que la part.
      grid.add(column, item, true, !closed.has(day.value));
    }
  });

  const columns = range.days.map((day, index) => ({
    date: day.value,
    totalUnits: grid.totals[index] ?? 0,
    resupplyUnits: grid.resupplyTotals[index] ?? 0,
    orderCount: demandOf.get(day.value)?.orderCount ?? 0,
    closed: closed.has(day.value),
  }));

  return {
    columns,
    rows: [...grid.rows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sku, row]) => ({
        sku,
        productName: row.productName,
        saleUnit: row.saleUnit,
        quantities: row.quantities,
        resupplyQuantities: row.resupplyQuantities,
        totalUnits: row.quantities.reduce((sum, quantity) => sum + quantity, 0),
      })),
    peakDate: peakOf(columns),
    totalUnits: columns.reduce((sum, column) => sum + column.totalUnits, 0),
  };
}

/** Les réassorts de chaque journée, de la source que son état désigne. */
function resuppliesByDay(
  closed: ReadonlySet<string>,
  resupplies: ForecastResupplies,
): ReadonlyMap<string, readonly DemandItem[]> {
  const byDay = new Map<string, readonly DemandItem[]>();
  for (const day of resupplies.expected) {
    if (!closed.has(day.day)) {
      byDay.set(day.day, day.items);
    }
  }
  for (const day of resupplies.arrested) {
    if (closed.has(day.day)) {
      byDay.set(day.day, day.items);
    }
  }
  return byDay;
}

interface GridRow {
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  readonly quantities: number[];
  readonly resupplyQuantities: number[];
}

/** L'accumulateur de la matrice : les lignes par SKU et les totaux par colonne. */
class Grid {
  readonly rows = new Map<string, GridRow>();
  readonly totals: number[];
  readonly resupplyTotals: number[];

  constructor(private readonly width: number) {
    this.totals = this.zeros();
    this.resupplyTotals = this.zeros();
  }

  /**
   * Inscrit un article dans une colonne. `asResupply` en marque la part de
   * réassort ; `counted` = `false` quand la quantité est DÉJÀ dans le total
   * (réassort figé d'une journée close).
   */
  add(column: number, item: DemandItem, asResupply: boolean, counted = true): void {
    const row = this.rows.get(item.sku) ?? {
      productName: item.productName,
      saleUnit: item.saleUnit,
      quantities: this.zeros(),
      resupplyQuantities: this.zeros(),
    };
    // La colonne additionne des ARTICLES différents : un article au poids y
    // pèse une pièce, ses grammes restent sur sa ligne (P6).
    const tally = pieceTally(saleQuantity(item.quantity, item.saleUnit));
    if (counted) {
      row.quantities[column] = (row.quantities[column] ?? 0) + item.quantity;
      this.totals[column] = (this.totals[column] ?? 0) + tally;
    }
    if (asResupply) {
      row.resupplyQuantities[column] = (row.resupplyQuantities[column] ?? 0) + item.quantity;
      this.resupplyTotals[column] = (this.resupplyTotals[column] ?? 0) + tally;
    }
    this.rows.set(item.sku, row);
  }

  private zeros(): number[] {
    return Array.from({ length: this.width }, () => 0);
  }
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
