import type {
  BillingAddressPayload,
  FulfillmentMethod,
  FulfillmentWindow,
  PlannedColumnStatus,
  PlannedColumnView,
  PlannedLineCheckView,
  PlannedRoutingView,
  PlannerView,
  ShopQuotePayload,
} from '@lfd/contracts';

import type { ServiceChoice } from '../order-context.store';

/**
 * **La grille du planificateur**, en fonctions pures (plan
 * `documentation/commandes/planificateur/plan-planificateur-de-commandes.md`,
 * § 3.2 et § 4 bis) : les jours en colonnes, une rangée par créneau, et
 * chaque case jour × créneau est un panier.
 *
 * Rien n'est jugé ici : ce qui bloque vient des `checks` du serveur. L'écran
 * ne fait que les ranger par case et par jour.
 */

/** Une ligne d'une case : un article et sa quantité, dans l'unité de l'article. */
export interface PlannerLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Une case**, telle que l'écran la tient. `columnId` à `null` : rien n'est
 * encore enregistré (une case vide n'est qu'un emplacement, § 3.2).
 */
export interface PlannerCell {
  readonly key: string;
  readonly day: string;
  readonly window: FulfillmentWindow;
  readonly columnId: string | null;
  readonly version: number | null;
  readonly status: PlannedColumnStatus;
  readonly lines: readonly PlannerLine[];
  readonly convertsAt: string | null;
  readonly orderId: string | null;
  readonly refusal: { readonly cause: string; readonly reason: string } | null;
}

/** La clé d'un créneau : `07:00-09:00`, ou `-09:00` sans borne basse. */
export function windowKey(window: FulfillmentWindow): string {
  return `${window.start ?? ''}-${window.end}`;
}

/** La clé d'une case : le jour et le créneau. */
export function cellKey(day: string, window: FulfillmentWindow): string {
  return `${day}|${windowKey(window)}`;
}

/** Le lendemain d'un jour `AAAA-MM-JJ`, compté en UTC : une date nue n'a pas de fuseau. */
export function nextDay(day: string): string {
  const instant = new Date(`${day}T12:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString().slice(0, 10);
}

/** Les créneaux triés par heure de fin, puis de début. */
export function sortWindows(windows: readonly FulfillmentWindow[]): readonly FulfillmentWindow[] {
  return [...windows].sort(
    (a, b) => a.end.localeCompare(b.end) || (a.start ?? '').localeCompare(b.start ?? ''),
  );
}

/** Les créneaux distincts, dans l'ordre de la journée. */
export function distinctWindows(
  windows: readonly FulfillmentWindow[],
): readonly FulfillmentWindow[] {
  const seen = new Map<string, FulfillmentWindow>();
  for (const window of windows) {
    seen.set(windowKey(window), { start: window.start, end: window.end });
  }
  return sortWindows([...seen.values()]);
}

/** La case d'une colonne du serveur. */
export function cellOfColumn(column: PlannedColumnView): PlannerCell {
  return {
    key: cellKey(column.day, column.routing.window),
    day: column.day,
    window: column.routing.window,
    columnId: column.id,
    version: column.version,
    status: column.status,
    lines: column.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    convertsAt: column.convertsAt,
    orderId: column.orderId,
    refusal: column.refusal,
  };
}

/** Le jour et le créneau d'une clé de case — l'inverse de {@link cellKey}. */
export function placeOfKey(key: string): {
  readonly day: string;
  readonly window: FulfillmentWindow;
} {
  const [day = '', slot = ''] = key.split('|');
  const [start = '', end = ''] = slot.split('-');
  return { day, window: { start: start === '' ? null : start, end } };
}

/** Une case sans rien d'enregistré. */
export function emptyCell(day: string, window: FulfillmentWindow): PlannerCell {
  return {
    key: cellKey(day, window),
    day,
    window,
    columnId: null,
    version: null,
    status: 'draft',
    lines: [],
    convertsAt: null,
    orderId: null,
    refusal: null,
  };
}

/** Toutes les colonnes de la vue, à plat. */
export function columnsOf(view: PlannerView): readonly PlannedColumnView[] {
  return view.days.flatMap((day) => day.columns);
}

/**
 * L'acheminement que le planificateur reprend : celui de la première colonne
 * enregistrée (chaque colonne porte le sien, § 3.2), sinon `null`.
 */
export function routingOfView(view: PlannerView): PlannedRoutingView | null {
  return columnsOf(view)[0]?.routing ?? null;
}

/**
 * **Une case s'écrit-elle encore ?** En brouillon, et avant son instant de
 * gel. Le serveur juge quand même : une écriture refusée recharge la case.
 */
export function isEditable(cell: PlannerCell, now: Date): boolean {
  if (cell.status !== 'draft') {
    return false;
  }
  return cell.convertsAt === null || now.getTime() < new Date(cell.convertsAt).getTime();
}

/** Ce que le serveur dit d'une ligne enregistrée dans une colonne. */
export function lineCheckOf(
  checks: readonly PlannedLineCheckView[],
  columnId: string | null,
  sku: string,
): PlannedLineCheckView | null {
  if (columnId === null) {
    return null;
  }
  return checks.find((check) => check.columnId === columnId && check.sku === sku) ?? null;
}

/**
 * **Pourquoi un article ne passe pas ce jour-là**, s'il ne passe pas — la
 * phrase du refus réel, ou `null`.
 *
 * Seul ce qui tient à l'article et au jour grise (`quantityIndependent`,
 * § 4 bis) : un plafond par commande se règle après le dépôt. La réponse sert
 * le glisser comme le menu « Ajouter à… / Déplacer vers… ».
 */
export function dayRefusalOf(
  checks: readonly PlannedLineCheckView[],
  sku: string,
  day: string,
): string | null {
  const blocked = checks.find(
    (check) =>
      check.sku === sku &&
      check.day === day &&
      check.quantityIndependent &&
      check.blocking !== null,
  );
  return blocked?.blocking?.reason ?? null;
}

/**
 * **Le plus proche `closesAt` encore à venir** — l'instant où ce qui bloque
 * peut changer, et où l'écran relit la vérification (§ 4 bis). `null` s'il
 * n'y en a aucun.
 */
export function nearestClose(checks: readonly PlannedLineCheckView[], now: Date): Date | null {
  let nearest: number | null = null;
  for (const check of checks) {
    if (check.closesAt === null) {
      continue;
    }
    const at = new Date(check.closesAt).getTime();
    if (at > now.getTime() && (nearest === null || at < nearest)) {
      nearest = at;
    }
  }
  return nearest === null ? null : new Date(nearest);
}

/** Les SKU bloquants d'une case, selon le serveur. */
export function blockingSkusOf(
  checks: readonly PlannedLineCheckView[],
  cell: PlannerCell,
): readonly string[] {
  return cell.lines
    .map((line) => line.sku)
    .filter((sku) => lineCheckOf(checks, cell.columnId, sku)?.blocking != null);
}

/** Les lignes après avoir posé `quantity` sur `sku` ; zéro retire la ligne. */
export function withQuantity(
  lines: readonly PlannerLine[],
  sku: string,
  quantity: number,
): readonly PlannerLine[] {
  if (quantity <= 0) {
    return lines.filter((line) => line.sku !== sku);
  }
  if (lines.some((line) => line.sku === sku)) {
    return lines.map((line) => (line.sku === sku ? { sku, quantity } : line));
  }
  return [...lines, { sku, quantity }];
}

/** L'acheminement du planificateur, sans son créneau : le créneau est la rangée. */
export interface PlannerRouting {
  readonly method: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
}

/** La demande de devis d'une case : ses lignes, son acheminement, son jour et son créneau. */
export function quotePayload(cell: PlannerCell, routing: PlannerRouting): ShopQuotePayload {
  const fulfillment: ShopQuotePayload['fulfillment'] =
    routing.method === 'delivery' && routing.deliveryAddress !== null
      ? { method: 'delivery', codePostal: routing.deliveryAddress.codePostal }
      : { method: 'pickup', pickupAddressId: routing.pickupAddressId };
  return {
    lines: cell.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    fulfillment,
    requestedDeliveryDate: cell.day,
    requestedWindow: cell.window,
  };
}

/**
 * L'acheminement du planificateur : celui des colonnes enregistrées (chaque
 * colonne porte le sien, § 3.2), sinon le mode de service choisi dans la
 * boutique. `null` : rien n'est choisi, rien ne s'ouvre.
 */
export function plannerRoutingOf(
  saved: PlannedRoutingView | null,
  choice: ServiceChoice | null,
): PlannerRouting | null {
  if (saved !== null) {
    const { method, deliveryAddress, pickupAddressId } = saved;
    return { method, deliveryAddress, pickupAddressId };
  }
  if (choice === null) {
    return null;
  }
  return choice.mode === 'pickup'
    ? { method: 'pickup', deliveryAddress: null, pickupAddressId: choice.pickupAddressId }
    : { method: 'delivery', deliveryAddress: choice.deliveryAddress, pickupAddressId: null };
}
