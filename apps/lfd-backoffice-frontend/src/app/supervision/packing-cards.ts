import type {
  HandoverQueueEntryView,
  HandoverQueueView,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';

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
  readonly customerLabel: string;
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
}

export interface PackingBoard {
  /** La journée n'est pas arrêtée : il n'y a rien à coliser, et la colonne le dit. */
  readonly notClosed: boolean;
  /** Les cartes montrées, dix au plus. */
  readonly visible: readonly PackingCard[];
  /** « + N commandes » au-delà de dix. */
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
    customerLabel: sheet.customerLabel,
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
  return {
    notClosed: view.closedAt === null,
    visible: open.slice(0, PACKING_VISIBLE_MAX),
    overflow: Math.max(0, open.length - PACKING_VISIBLE_MAX),
    packed: cards.filter((card) => card.state === 'packed'),
    toPack: open.length,
    awaitingOven: cards.filter((card) => card.state === 'awaiting_oven').length,
  };
}
