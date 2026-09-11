import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
  type CatalogItemView,
  type ProductionForecastLine,
  type ProductionForecastView,
} from '@lfd/contracts';

/**
 * La **matrice du prévisionnel**, telle que l'écran la lit — et rien d'autre.
 *
 * Le serveur rend la grille à plat, une ligne par produit, triée par SKU : un
 * ordre stable, donc deux lectures rendent la même chose. L'ordre d'AFFICHAGE,
 * lui, est ici, parce qu'il dépend du **catalogue d'aujourd'hui** :
 *
 * - les rayons sortent dans l'**ordre de la vitrine** (`CATALOG_CATEGORY_ORDER`)
 *   et non par poids — c'est l'ordre que l'équipe connaît déjà, et un ordre qui
 *   bougerait d'un jour à l'autre obligerait à relire la grille en entier ;
 * - à l'intérieur d'un rayon, la **quantité décroissante** sur toute la plage :
 *   c'est par le plus gros que le fournil commence. À égalité, par nom, pour que
 *   deux affichages rendent la même grille.
 *
 * C'est la même règle que la récapitulation du jour (`production-recap.ts`), et
 * pour la même raison : le rayon est une propriété du catalogue, pas de la
 * commande. Un SKU que le catalogue ne connaît plus ne disparaît pas pour autant
 * — il tombe dans un groupe à part, en fin de liste.
 */

/** Le groupe des produits que le catalogue ne connaît plus — jamais silencieux. */
const OFF_CATALOG_LABEL = 'Hors catalogue';

/**
 * Le facteur au-delà duquel une quantité est **exceptionnelle** : deux fois la
 * moyenne des jours où ce produit sort. C'est la commande qui double une ligne,
 * celle qu'on veut voir sans la chercher.
 */
const EXCEPTIONAL_FACTOR = 2;

/** Une case : sa quantité, et si elle sort de l'ordinaire pour ce produit-là. */
export interface ForecastCell {
  readonly quantity: number;
  /** `true` = plus de deux fois la moyenne du produit sur ses jours actifs. */
  readonly exceptional: boolean;
}

/** Une ligne de la grille : un produit, et ce qu'il pèse chaque jour. */
export interface ForecastProduct {
  readonly sku: string;
  readonly productName: string;
  readonly cells: readonly ForecastCell[];
  readonly totalUnits: number;
}

/** Un rayon : son nom, son poids par jour, et ses produits. */
export interface ForecastRayon {
  /** `null` = les SKU que le catalogue ne connaît plus. */
  readonly category: CatalogCategory | null;
  readonly label: string;
  /** Le total du rayon jour par jour — la ligne de tête du groupe. */
  readonly quantities: readonly number[];
  readonly totalUnits: number;
  readonly lines: readonly ForecastProduct[];
}

/**
 * Groupe les lignes du prévisionnel par rayon.
 *
 * ⚠️ Le nombre de colonnes vient de `view.days`, **jamais** de la longueur d'une
 * ligne : le contrat promet les deux égales, et s'y fier ici ferait dépendre
 * l'alignement de la grille de la première ligne reçue.
 */
export function forecastRayons(
  view: ProductionForecastView,
  catalogue: readonly CatalogItemView[],
): readonly ForecastRayon[] {
  const categoryOf = new Map(catalogue.map((item) => [item.sku, item.category]));
  const width = view.days.length;
  const peakColumn = view.days.findIndex((day) => day.date === view.peakDate);
  const buckets = new Map<CatalogCategory | null, ForecastProduct[]>();

  for (const line of view.lines) {
    const category = categoryOf.get(line.sku) ?? null;
    const lines = buckets.get(category) ?? [];
    lines.push(productOf(line, width, peakColumn));
    buckets.set(category, lines);
  }

  const ordered: (CatalogCategory | null)[] = [...CATALOG_CATEGORY_ORDER, null];
  return ordered
    .filter((category) => buckets.has(category))
    .map((category) => {
      const lines = [...(buckets.get(category) ?? [])].sort(
        (a, b) => b.totalUnits - a.totalUnits || a.productName.localeCompare(b.productName, 'fr'),
      );
      return {
        category,
        label: category === null ? OFF_CATALOG_LABEL : CATALOG_CATEGORY_LABELS[category],
        quantities: Array.from({ length: width }, (_unused, column) =>
          lines.reduce((sum, line) => sum + (line.cells[column]?.quantity ?? 0), 0),
        ),
        totalUnits: lines.reduce((sum, line) => sum + line.totalUnits, 0),
        lines,
      };
    });
}

/** Le total de pièces de la plage — le chiffre qu'on annonce en une phrase. */
export function totalOfRayons(rayons: readonly ForecastRayon[]): number {
  return rayons.reduce((sum, rayon) => sum + rayon.totalUnits, 0);
}

/**
 * Une ligne du contrat, augmentée de ce que l'écran marque.
 *
 * La moyenne se prend sur les jours **actifs** — ceux où le produit sort — et
 * non sur toute la plage : un produit livré le seul samedi aurait sinon une
 * moyenne sept fois trop basse, et ses 400 pièces habituelles passeraient pour
 * une commande exceptionnelle chaque semaine.
 */
function productOf(
  line: ProductionForecastLine,
  width: number,
  peakColumn: number,
): ForecastProduct {
  const active = line.quantities.filter((quantity) => quantity > 0);
  const average =
    active.length === 0 ? 0 : active.reduce((sum, quantity) => sum + quantity, 0) / active.length;
  return {
    sku: line.sku,
    productName: line.productName,
    cells: Array.from({ length: width }, (_unused, column) => {
      const quantity = line.quantities[column] ?? 0;
      return {
        quantity,
        // Deux silences, et le second a été trouvé en REGARDANT la grille :
        //
        // - un produit qui ne sort qu'un jour n'a rien d'exceptionnel : sa
        //   moyenne EST sa seule valeur, et tout l'écran se pastillerait ;
        // - la colonne du PIC est déjà annoncée, en tête, en couleur et en
        //   toutes lettres. Presque chaque produit y dépasse deux fois sa
        //   moyenne — c'est la définition d'un pic —, donc la mention s'y
        //   répétait ligne après ligne et cessait d'être un signal. Ce qu'on
        //   veut voir, c'est la commande qui double une ligne un jour où
        //   PERSONNE ne s'y attend.
        exceptional:
          active.length > 1 && column !== peakColumn && quantity > average * EXCEPTIONAL_FACTOR,
      };
    }),
    totalUnits: line.totalUnits,
  };
}
