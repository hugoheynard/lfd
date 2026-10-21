import type {
  LiveStockAlertsView,
  ResupplyProductionDayView,
  ResupplyTarget,
  StockAlertLevel,
} from '@lfd/contracts';

/** Une colonne de la table : un point (Labo, Village…). */
export interface ResupplyPoint {
  readonly siteId: string;
  readonly label: string;
  /**
   * Les noms des réassorts nommés du point, la journée affichée (R1g,
   * « Vitrine du matin »), distincts, dans l'ordre du serveur ; vide : aucun.
   */
  readonly names: readonly string[];
}

/** Ce qu'un point demande d'un produit, la journée affichée, et son alerte. */
export interface ResupplyCell {
  readonly tomorrow: number;
  readonly asap: number;
  /** La rupture ou le stock faible que le point a déclaré ; `null` : rien. */
  readonly alert: StockAlertLevel | null;
}

/** Une ligne de la table : un produit, ses cases par point, et son total. */
export interface ResupplyProductionRow {
  readonly sku: string;
  readonly name: string;
  /** Sa famille au catalogue ; `null` : hors catalogue (un réassort d'un article retiré). */
  readonly categoryId: string | null;
  /** Une case par point, dans l'ordre des colonnes. */
  readonly cells: readonly ResupplyCell[];
  /** Pour demain + au plus tôt, tous points. */
  readonly total: number;
  /** La pire alerte de la ligne, pour la teinter. */
  readonly alert: StockAlertLevel | null;
}

/** Le nom d'un point dont l'annuaire ne sait plus rien. */
const UNKNOWN_POINT = 'Point inconnu';

/**
 * Les colonnes : les points qui ont un réassort la journée affichée, puis
 * ceux qui ont une alerte vivante — dans l'ordre où le serveur les rend.
 */
export function resupplyPoints(
  view: ResupplyProductionDayView,
  alerts: LiveStockAlertsView | null,
): readonly ResupplyPoint[] {
  const points = new Map<string, string>();
  for (const site of [...view.sites, ...(alerts?.sites ?? [])]) {
    if (!points.has(site.siteId)) {
      points.set(site.siteId, site.siteLabel ?? UNKNOWN_POINT);
    }
  }
  return [...points].map(([siteId, label]) => ({ siteId, label, names: namesOf(view, siteId) }));
}

function namesOf(view: ResupplyProductionDayView, siteId: string): readonly string[] {
  const resupplies = view.sites.find((site) => site.siteId === siteId)?.resupplies ?? [];
  return [
    ...new Set(resupplies.flatMap((resupply) => (resupply.name === null ? [] : [resupply.name]))),
  ];
}

/**
 * **La table de l'onglet Réassorts** (lot R3d, Hugo 2026-10-21 : « reprendre
 * la structure de la demande de réassort, en table ») : une ligne par produit
 * du catalogue — plus un article demandé qui n'y serait plus —, une case par
 * point. Même tri que la table du comptoir (R1e) : les alertes en tête, puis
 * les produits demandés, puis le reste, chacun par nom.
 *
 * `alerts` : les alertes vivantes, ou `null` quand elles ne disent rien de la
 * journée affichée (une journée passée) ou n'ont pas pu être lues.
 */
export function resupplyProductionRows(
  view: ResupplyProductionDayView,
  points: readonly ResupplyPoint[],
  alerts: LiveStockAlertsView | null,
): readonly ResupplyProductionRow[] {
  const names = new Map(view.articles.map((article) => [article.sku, article.name] as const));
  const families = new Map(view.articles.map((a) => [a.sku, a.categoryId] as const));
  for (const total of view.totals) {
    if (!names.has(total.sku)) {
      names.set(total.sku, total.label);
    }
  }
  const quantities = quantitiesOf(view);
  const levels = levelsOf(alerts);
  const rows = [...names].map(([sku, name]) => {
    const cells = points.map((point) => ({
      tomorrow: quantities.get(key(point.siteId, sku, 'tomorrow')) ?? 0,
      asap: quantities.get(key(point.siteId, sku, 'asap')) ?? 0,
      alert: levels.get(`${point.siteId}|${sku}`) ?? null,
    }));
    return {
      sku,
      name,
      categoryId: families.get(sku) ?? null,
      cells,
      total: cells.reduce((sum, cell) => sum + cell.tomorrow + cell.asap, 0),
      alert: worstOf(cells),
    };
  });
  return rows.sort((a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name, 'fr'));
}

function key(siteId: string, sku: string, target: ResupplyTarget): string {
  return `${siteId}|${sku}|${target}`;
}

function quantitiesOf(view: ResupplyProductionDayView): ReadonlyMap<string, number> {
  const quantities = new Map<string, number>();
  for (const site of view.sites) {
    for (const resupply of site.resupplies) {
      for (const line of resupply.lines) {
        const at = key(site.siteId, line.sku, resupply.target);
        quantities.set(at, (quantities.get(at) ?? 0) + line.quantity);
      }
    }
  }
  return quantities;
}

function levelsOf(alerts: LiveStockAlertsView | null): ReadonlyMap<string, StockAlertLevel> {
  return new Map(
    (alerts?.sites ?? []).flatMap((site) =>
      site.alerts.map((alert) => [`${site.siteId}|${alert.sku}`, alert.level] as const),
    ),
  );
}

function worstOf(cells: readonly ResupplyCell[]): StockAlertLevel | null {
  if (cells.some((cell) => cell.alert === 'out_of_stock')) {
    return 'out_of_stock';
  }
  return cells.some((cell) => cell.alert === 'low') ? 'low' : null;
}

/** Le rang de tri : alertes, puis demandés, puis le reste. */
function rankOf(row: ResupplyProductionRow): number {
  if (row.alert !== null) {
    return 0;
  }
  return row.total > 0 ? 1 : 2;
}
