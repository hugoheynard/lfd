import type {
  HandoverQueueEntryView,
  HandoverQueueView,
  OrderClientele,
  PackingAbandonedLine,
  PackingDeliveryNotePrint,
  PackingSheet,
  ProductionPackingView,
  WithdrawnPackingSheet,
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
  /**
   * Pro ou particulier, lu sur la fiche de colis — `null` : inconnue (commande
   * d'avant la distinction, journée arrêtée avant le champ). Le badge se tait alors.
   */
  readonly clientele: OrderClientele | null;
  /** Le site qui remet un retrait, lu sur la fiche ; `null` : livraison, ou inconnu. */
  readonly siteId: string | null;
  /** Le point de retrait figé, lu dans la file — le nom d'un retrait sans site connu. */
  readonly pickupLabel: string | null;
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
  /**
   * Minutes depuis minuit de l'échéance de la fiche (`dueAt`), sinon du créneau
   * de la file joint par `reference` ; `null` = aucune heure — la carte va en fin.
   */
  readonly slotMinutes: number | null;
  /**
   * « 5 h 12 » — quand la commande a été DÉCLARÉE prête, ou `null` tant
   * qu'elle ne l'est pas (Hugo, 2026-09-28 : l'heure manquait aux colisées).
   */
  readonly packedAt: string | null;
  /** L'id de la commande tel que la fiche de colis le porte — celui du BL à imprimer. */
  readonly sheetOrderId: string;
  /** « BL à réimprimer » / « Nouveau BL imprimé » (plan E6, § 14), dit par le serveur. */
  readonly deliveryNotePrint: PackingDeliveryNotePrint | null;
  /** Le reste abandonné d'un départ incomplet décidé ; vide sinon (Hugo, 2026-10-25). */
  readonly abandoned: readonly PackingAbandonedLine[];
  /** « Sur stock » (lot L6), lu dans `supervision/day` — faux si la journée n'est pas lue. */
  readonly shelf: boolean;
}

/**
 * Une commande **attendue** d'une journée pas encore arrêtée : lue dans la file
 * de retrait, parce que le fournil n'a aucune fiche de colis avant l'arrêt.
 */
export interface UpcomingOrder {
  readonly reference: string;
  readonly customerLabel: string;
  readonly clientele: OrderClientele | null;
  readonly method: 'pickup' | 'delivery';
  readonly siteId: string | null;
  readonly pickupLabel: string | null;
  readonly totalUnits: number;
  readonly slotMinutes: number | null;
  /** « Sur stock » (lot L6), lu dans `supervision/day`. */
  readonly shelf: boolean;
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
   * TOUTES les commandes ouvertes, par horaire (2026-11-01) : la colonne
   * filtre par acheminement, PUIS montre les dix premières — plafonner ici aurait
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
  /**
   * Les feuilles retirées par une annulation après l'arrêt (plan A1, lot
   * A1.3) — hors des cartes et des comptes, montrées à part sous le badge
   * « annulée après l'arrêt ».
   */
  readonly withdrawn: readonly WithdrawnPackingSheet[];
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

/**
 * **Attend le colisage** : le four a tout sorti, le sac n'est pas fermé — à
 * coliser ou en cours. Lu sur la fiche de colis, pas sur la file de retrait :
 * une commande au créneau dépassé y change d'état et n'y comptait plus (la
 * pastille disait 0 avec deux commandes à coliser, vu le 2026-09-28).
 */
export function awaitsPacking(sheet: PackingSheet): boolean {
  const state = packingStateOf(sheet);
  return state === 'to_pack' || state === 'in_progress';
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

/**
 * L'échéance de la fiche (`dueAt`, figée à l'arrêt — celle que le poste de
 * colisage sert d'abord), `null` si elle n'en porte pas : la carte retombe
 * alors sur le créneau de la file.
 */
function dueMinutesOf(sheet: PackingSheet): number | null {
  return sheet.dueAt === undefined || sheet.dueAt === null ? null : minutesOf(sheet.dueAt);
}

function cardOf(
  sheet: PackingSheet,
  entry: HandoverQueueEntryView | undefined,
  shelf: ReadonlySet<string>,
): PackingCard {
  return {
    reference: sheet.reference,
    orderId: entry?.orderId ?? null,
    customerLabel: sheet.customerLabel,
    // La fiche de colis porte clientèle et site, figés à l'arrêt : elle fait foi.
    clientele: sheet.clientele,
    siteId: sheet.siteId ?? null,
    pickupLabel: entry?.pickupLabel ?? null,
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
    slotMinutes: dueMinutesOf(sheet) ?? slotOf(entry),
    packedAt: sheet.packedAt === null ? null : clockLabel(sheet.packedAt),
    sheetOrderId: sheet.orderId,
    deliveryNotePrint: sheet.deliveryNotePrint ?? null,
    abandoned: sheet.abandonedRemainder ?? [],
    shelf: shelf.has(sheet.orderId),
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
 * les commandes vont « en fin », dans l'ordre du serveur. `shelfOrderIds` :
 * les commandes sur stock du jour (`supervision/day`), vide si non lue.
 */
export function packingBoard(
  view: ProductionPackingView,
  queue: HandoverQueueView | null,
  shelfOrderIds: readonly string[] = [],
): PackingBoard {
  const byReference = new Map((queue?.entries ?? []).map((entry) => [entry.reference, entry]));
  const shelf = new Set(shelfOrderIds);
  const cards = view.sheets.map((sheet) => cardOf(sheet, byReference.get(sheet.reference), shelf));
  // Par horaire, l'échéance la plus proche d'abord (Hugo, 2026-11-01) — un tri
  // GLOBAL : la colonne n'a pas d'intertitres par état, et l'ancien rang
  // « au four / en cours d'abord » faisait passer 9 h devant 6 h 30. `sort`
  // est stable : à heure égale, l'ordre du serveur.
  const open = cards.filter((card) => card.state !== 'packed').sort(bySlot);
  const notClosed = view.closedAt === null;
  return {
    notClosed,
    upcoming: notClosed ? upcomingOf(queue, shelf) : [],
    visible: open,
    overflow: Math.max(0, open.length - PACKING_VISIBLE_MAX),
    packed: cards.filter((card) => card.state === 'packed').sort(bySlot),
    toPack: open.length,
    awaitingOven: cards.filter((card) => card.state === 'awaiting_oven').length,
    withdrawn: view.withdrawnSheets,
  };
}

/** Les commandes attendues, hors annulées, par heure de retrait. */
function upcomingOf(queue: HandoverQueueView | null, shelf: ReadonlySet<string>): UpcomingOrder[] {
  return (queue?.entries ?? [])
    .filter((entry) => entry.state !== 'cancelled')
    .map((entry) => ({
      reference: entry.reference,
      customerLabel: entry.tradeName ?? entry.customerLabel,
      clientele: entry.clientele,
      method: entry.fulfillmentMethod,
      siteId: entry.siteId ?? null,
      pickupLabel: entry.pickupLabel,
      totalUnits: entry.totalUnits,
      slotMinutes: slotOf(entry),
      shelf: shelf.has(entry.orderId),
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
