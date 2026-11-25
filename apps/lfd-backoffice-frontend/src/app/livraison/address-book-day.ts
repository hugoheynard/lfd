import type {
  DeliveryAddressBookRow,
  DeliveryDayAddressOrder,
  DeliveryDayWindow,
  DeliverySlot,
  PreferredDeadlines,
  PreferredSlots,
} from '@lfd/contracts';

/**
 * **Une ligne de la table des adresses** — celle du registre général, ou celle
 * d'un jour de livraison : une adresse, à une heure convenue, avec les
 * commandes qui y vont. Au registre, ni heure ni commande.
 */
export interface AddressBookLine extends DeliveryAddressBookRow {
  /** Unique dans la table : l'adresse au registre, l'adresse et l'heure un jour donné. */
  readonly key: string;
  /** « avant 10:00 », « 08:00–10:00 », « Sans heure » ; `null` au registre. */
  readonly timeLabel: string | null;
  /** Les numéros des commandes livrées là à cette heure ; vide au registre. */
  readonly references: readonly string[];
}

/** Une ligne du registre général. */
export function registerLineOf(row: DeliveryAddressBookRow): AddressBookLine {
  return { ...row, key: row.addressId, timeLabel: null, references: [] };
}

const WEEKDAY_LABELS = [
  ['mon', 'Lun'],
  ['tue', 'Mar'],
  ['wed', 'Mer'],
  ['thu', 'Jeu'],
  ['fri', 'Ven'],
  ['sat', 'Sam'],
  ['sun', 'Dim'],
] as const;

/** Ce que la colonne « Livraison » dit d'une adresse. */
export interface DeliveryTimes {
  /** « Échéances », « Créneaux », ou « Réglage global ». */
  readonly mode: string;
  /** « Tous les jours : 06:00 · 11:00 », ou une ligne par jour servi ; vide : aucune. */
  readonly lines: readonly string[];
}

function slotLabelOf(slot: DeliverySlot): string {
  return `${slot.start}–${slot.end}`;
}

function deadlineLines(deadlines: PreferredDeadlines | null): readonly string[] {
  if (deadlines === null) {
    return [];
  }
  if (deadlines.mode === 'everyday') {
    return [`Tous les jours : ${deadlines.times.join(' · ')}`];
  }
  return WEEKDAY_LABELS.flatMap(([day, label]) => {
    const times = deadlines.byDay[day];
    return times === null ? [] : [`${label} : ${times.join(' · ')}`];
  });
}

function slotLines(slots: PreferredSlots): readonly string[] {
  if (slots.mode === 'everyday') {
    return slots.slots.length === 0
      ? []
      : [`Tous les jours : ${slots.slots.map(slotLabelOf).join(' · ')}`];
  }
  return WEEKDAY_LABELS.flatMap(([day, label]) => {
    const list = slots.byDay[day];
    return list === null || list.length === 0
      ? []
      : [`${label} : ${list.map(slotLabelOf).join(' · ')}`];
  });
}

/**
 * Les créneaux ou les échéances d'une adresse, selon son mode. Une adresse qui
 * suit le réglage global montre ses échéances, ou à défaut ses créneaux : le
 * mode global n'est pas lu ici.
 */
export function deliveryTimesOf(row: DeliveryAddressBookRow): DeliveryTimes {
  if (row.windowMode === 'deadline') {
    return { mode: 'Échéances', lines: deadlineLines(row.deadlines) };
  }
  if (row.windowMode === 'slot') {
    return { mode: 'Créneaux', lines: slotLines(row.slots) };
  }
  const deadlines = deadlineLines(row.deadlines);
  return { mode: 'Réglage global', lines: deadlines.length > 0 ? deadlines : slotLines(row.slots) };
}

/** « avant 10:00 », « 08:00–10:00 », ou « Sans heure ». */
export function windowLabelOf(window: DeliveryDayWindow | null): string {
  if (window === null) {
    return 'Sans heure';
  }
  return window.start === null ? `avant ${window.end}` : `${window.start}–${window.end}`;
}

/** Le rang d'une heure : la première heure où l'on peut livrer, puis la dernière ; sans heure à la fin. */
function windowRankOf(window: DeliveryDayWindow | null): string {
  return window === null ? '~' : `${window.start ?? window.end}|${window.end}`;
}

/** En ordre brut : `localeCompare` ignore la ponctuation, et « sans heure » remonterait. */
function compareRanks(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Une adresse que le carnet ne connaît pas : celle que la commande a figée. */
function unbookedRowOf(order: DeliveryDayAddressOrder): DeliveryAddressBookRow {
  const address = order.address;
  return {
    addressId: order.addressId ?? order.orderId,
    companyId: order.companyId ?? '',
    tradeName: '',
    legalName: order.customerLabel,
    addressLabel: address?.label ?? '',
    ligne1: address?.ligne1 ?? '',
    ligne2: address?.ligne2 ?? '',
    codePostal: address?.codePostal ?? '',
    ville: address?.ville ?? '',
    pays: address?.pays ?? '',
    isDefault: false,
    door: null,
    parking: null,
    note: '',
    deliveryContact: null,
    depositAllowed: false,
    doorstepRule: null,
    stopMinutes: null,
    signatureRequired: false,
    signatureSource: 'company',
    hasProcedure: false,
    windowMode: null,
    slots: { mode: 'everyday', slots: [] },
    deadlines: null,
  };
}

/** L'adresse du carnet d'une commande — même adresse ET même société, sinon aucune. */
function bookedRowOf(
  book: ReadonlyMap<string, DeliveryAddressBookRow>,
  order: DeliveryDayAddressOrder,
): DeliveryAddressBookRow | null {
  const row = order.addressId === null ? undefined : book.get(order.addressId);
  return row !== undefined && row.companyId === order.companyId ? row : null;
}

/**
 * **Les adresses d'un jour, classées par heure de livraison** : une ligne par
 * adresse et par heure convenue, qui réunit les commandes qui y vont. Une
 * commande reliée à une adresse du carnet en prend les consignes ; une autre
 * montre l'adresse qu'elle a figée, sans consignes.
 */
export function dayAddressLinesOf(
  book: readonly DeliveryAddressBookRow[],
  orders: readonly DeliveryDayAddressOrder[],
): readonly AddressBookLine[] {
  const byId = new Map(book.map((row) => [row.addressId, row]));
  const lines = new Map<string, { line: AddressBookLine; rank: string }>();
  for (const order of orders) {
    const row = bookedRowOf(byId, order) ?? unbookedRowOf(order);
    const timeLabel = windowLabelOf(order.window);
    const key = `${row.addressId}|${timeLabel}`;
    const known = lines.get(key);
    lines.set(key, {
      rank: windowRankOf(order.window),
      line: {
        ...row,
        key,
        timeLabel,
        references: [...(known?.line.references ?? []), order.reference],
      },
    });
  }
  return [...lines.values()]
    .sort(
      (a, b) =>
        compareRanks(a.rank, b.rank) ||
        (a.line.tradeName || a.line.legalName).localeCompare(b.line.tradeName || b.line.legalName),
    )
    .map((entry) => entry.line);
}
