import type {
  HandoverQueueEntryView,
  HandoverQueueView,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';

import { clockLabel } from './supervision-labels';

/**
 * **La colonne 2 — l'unité est la commande.** Une carte par bac de la vue de
 * colisage (plan §5).
 *
 * 🔴 « Attend le four » est LU tel quel dans `lines[].awaitingProduction` :
 * le fournil le calcule (`production-packing.ts`), et il compte aussi en
 * attente un article absent du compte à produire. Le recalculer ici depuis la
 * fiche d'atelier ferait deux vérités, dont une fausse sur ce cas-là.
 */
export type PackingState = 'packed' | 'awaiting_oven' | 'in_progress' | 'to_pack';

export interface PackingCard {
  readonly reference: string;
  /**
   * L'id de la commande, joint par `reference` depuis la file de retrait — la
   * fiche de colis ne le porte pas. `null` = absente de la file, ou file
   * illisible : la commande ne peut alors pas être visée par un contrôle.
   */
  readonly orderId: string | null;
  readonly customerLabel: string;
  /** Retrait ou livraison : le mot de la méta (« retrait 8 h »). */
  readonly method: 'pickup' | 'delivery';
  /** Le point de destination de la fiche de colis — la clé du filtre « Tous les points ». */
  readonly destination: string;
  readonly state: PackingState;
  readonly lineCount: number;
  readonly packedLines: number;
  readonly containers: number;
  /** Les produits encore au four — la carte les nomme. */
  readonly awaited: readonly string[];
  /** Les initiales de qui a posé, sans doublon — la pastille « en cours · LT ». */
  readonly initials: readonly string[];
  /** Minutes depuis minuit du créneau, joint par `reference` ; `null` = pas dans la file ou sans créneau. */
  readonly slotMinutes: number | null;
  /**
   * « 5 h 12 » — quand la commande a été DÉCLARÉE prête, ou `null` tant
   * qu'elle ne l'est pas (Hugo, 2026-09-28 : l'heure manquait aux colisées).
   */
  readonly packedAt: string | null;
}

/**
 * Une commande **attendue** d'une journée pas encore arrêtée : lue dans la file
 * de retrait, parce que le fournil n'a aucune fiche de colis avant l'arrêt.
 */
export interface UpcomingOrder {
  readonly reference: string;
  readonly customerLabel: string;
  readonly totalUnits: number;
  readonly slotMinutes: number | null;
}

export interface PackingBoard {
  /** La journée n'est pas arrêtée : il n'y a rien à coliser, et la colonne le dit. */
  readonly notClosed: boolean;
  /**
   * Avant l'arrêt, les commandes que la journée ATTEND — pour que la colonne
   * dise la même chose que Retrait / livraison (Hugo, 2026-09-28 : « c'est pour
   * la cohérence »). Vide une fois la journée arrêtée : les fiches prennent le relais.
   */
  readonly upcoming: readonly UpcomingOrder[];
  /**
   * TOUTES les commandes ouvertes, triées (Supervision v2, A4) : la colonne
   * filtre par point, PUIS montre les dix premières — plafonner ici aurait
   * perdu, au filtre, les commandes du point rangées au-delà de dix.
   */
  readonly visible: readonly PackingCard[];
  /** « + N commandes » au-delà de dix, tous points confondus. */
  readonly overflow: number;
  /** Les bacs fermés, repliés en bas. */
  readonly packed: readonly PackingCard[];
  /** Le compteur d'en-tête et d'onglet : les commandes pas encore colisées. */
  readonly toPack: number;
  /** Les commandes qui attendent le four — la pastille sur l'onglet Préparation. */
  readonly awaitingOven: number;
}

/** Au-delà, la colonne dit « + N commandes » plutôt que de défiler sans fin. */
export const PACKING_VISIBLE_MAX = 10;

const MINUTES_PER_HOUR = 60;

/** Colisée gagne sur tout ; puis attend le four ; puis en cours ; sinon à coliser. */
export function packingStateOf(sheet: PackingSheet): PackingState {
  if (sheet.packedAt !== null) {
    return 'packed';
  }
  if (sheet.lines.some((line) => line.awaitingProduction)) {
    return 'awaiting_oven';
  }
  return sheet.packedLines > 0 ? 'in_progress' : 'to_pack';
}

/** `07:30` → 450. Une heure illisible ne se trie pas : `null`. */
export function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? null : Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

/** L'heure de retrait d'une entrée de file : le début du créneau, sinon sa fin. */
function slotOf(entry: HandoverQueueEntryView | undefined): number | null {
  const window = entry?.window ?? null;
  return window === null ? null : minutesOf(window.start ?? window.end);
}

function cardOf(sheet: PackingSheet, entry: HandoverQueueEntryView | undefined): PackingCard {
  return {
    reference: sheet.reference,
    orderId: entry?.orderId ?? null,
    customerLabel: sheet.customerLabel,
    method: sheet.fulfillmentMethod,
    destination: sheet.destination,
    state: packingStateOf(sheet),
    lineCount: sheet.lineCount,
    packedLines: sheet.packedLines,
    containers: sheet.containers,
    awaited: sheet.lines.filter((line) => line.awaitingProduction).map((line) => line.productName),
    initials: [
      ...new Set(
        sheet.lines
          .map((line) => line.initials)
          .filter((initials): initials is string => initials !== null && initials !== ''),
      ),
    ],
    slotMinutes: slotOf(entry),
    packedAt: sheet.packedAt === null ? null : clockLabel(sheet.packedAt),
  };
}

/** Par heure de retrait ; une commande sans créneau — ou absente de la file — va en fin. */
function bySlot(a: PackingCard, b: PackingCard): number {
  if (a.slotMinutes === null || b.slotMinutes === null) {
    return a.slotMinutes === null ? (b.slotMinutes === null ? 0 : 1) : -1;
  }
  return a.slotMinutes - b.slotMinutes;
}

/**
 * Les cartes de la colonne. La file de retrait est facultative : si sa lecture
 * a échoué, le colisage reste lisible — seul le tri par heure se perd, et toutes
 * les commandes vont « en fin », dans l'ordre du serveur.
 */
export function packingBoard(
  view: ProductionPackingView,
  queue: HandoverQueueView | null,
): PackingBoard {
  const byReference = new Map((queue?.entries ?? []).map((entry) => [entry.reference, entry]));
  const cards = view.sheets.map((sheet) => cardOf(sheet, byReference.get(sheet.reference)));
  const urgent = cards
    .filter((card) => card.state === 'awaiting_oven' || card.state === 'in_progress')
    .sort(bySlot);
  const waiting = cards.filter((card) => card.state === 'to_pack').sort(bySlot);
  const open = [...urgent, ...waiting];
  const notClosed = view.closedAt === null;
  return {
    notClosed,
    upcoming: notClosed ? upcomingOf(queue) : [],
    visible: open,
    overflow: Math.max(0, open.length - PACKING_VISIBLE_MAX),
    packed: cards.filter((card) => card.state === 'packed'),
    toPack: open.length,
    awaitingOven: cards.filter((card) => card.state === 'awaiting_oven').length,
  };
}

/** Les commandes attendues, hors annulées, par heure de retrait. */
function upcomingOf(queue: HandoverQueueView | null): UpcomingOrder[] {
  return (queue?.entries ?? [])
    .filter((entry) => entry.state !== 'cancelled')
    .map((entry) => ({
      reference: entry.reference,
      customerLabel: entry.tradeName ?? entry.customerLabel,
      totalUnits: entry.totalUnits,
      slotMinutes: slotOf(entry),
    }))
    .sort((a, b) => (a.slotMinutes ?? Infinity) - (b.slotMinutes ?? Infinity));
}

/** L'espace insécable : « 8 h 30 » ne se coupe jamais en fin de ligne. */
const NBSP = '\u00a0';

/** 450 → « 7 h 30 », 480 → « 8 h », insécables — l'heure de la méta d'une carte. */
export function hourLabel(minutes: number): string {
  const hours = String(Math.floor(minutes / MINUTES_PER_HOUR));
  const rest = minutes % MINUTES_PER_HOUR;
  return rest === 0
    ? `${hours}${NBSP}h`
    : `${hours}${NBSP}h${NBSP}${String(rest).padStart(2, '0')}`;
}

/** « CMD-4812 · retrait 8 h » ; sans créneau connu, le numéro seul. */
export function packingMeta(card: PackingCard): string {
  if (card.slotMinutes === null) {
    return card.reference;
  }
  const word = card.method === 'delivery' ? 'livraison' : 'retrait';
  return `${card.reference} · ${word} ${hourLabel(card.slotMinutes)}`;
}

/** Un point de destination et le nombre de commandes qui y vont. */
export interface PackingPoint {
  readonly destination: string;
  readonly count: number;
}

/** Les points des cartes (ouvertes puis colisées), par ordre alphabétique. */
export function packingPoints(board: PackingBoard): readonly PackingPoint[] {
  const counts = new Map<string, number>();
  for (const card of [...board.visible, ...board.packed]) {
    counts.set(card.destination, (counts.get(card.destination) ?? 0) + 1);
  }
  return [...counts]
    .map(([destination, count]) => ({ destination, count }))
    .sort((a, b) => a.destination.localeCompare(b.destination, 'fr'));
}

/** La valeur « Tous les points » du filtre de la colonne 2. */
export const ALL_POINTS = '';

/** Une entrée du filtre de points, avec le compte de ses commandes. */
export interface PointFilterOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

/** « Tous les points » en tête, puis chaque point par ordre alphabétique. */
export function pointFilterOptions(board: PackingBoard): readonly PointFilterOption[] {
  const points = packingPoints(board);
  return [
    {
      value: ALL_POINTS,
      label: 'Tous les points',
      count: board.visible.length + board.packed.length,
    },
    ...points.map((p) => ({ value: p.destination, label: p.destination, count: p.count })),
  ];
}
