import {
  DeliveryNote,
  type DeliveryNoteSource,
  type DeliveryNoteStatus,
} from "../entities/delivery-note.js";
import { DeliveryNoteNumber } from "../value-objects/delivery-note-number.js";

/** Les statuts d'une commande, tels que le BL les lit. */
export type FollowedOrderStatus =
  "draft" | "placed" | "confirmed" | "in_production" | "ready" | "fulfilled" | "cancelled";

/** Une commande, vue du BL qui la suit : ses lignes, son statut, ses instants. */
export interface FollowedOrder extends DeliveryNoteSource {
  readonly status: FollowedOrderStatus;
  readonly confirmedAt: Date | null;
  readonly readyAt: Date | null;
  readonly handedOverAt: Date | null;
  /** `AAAA-MM-JJ`, ou `null` si pas encore reçue. */
  readonly receivedOn: string | null;
}

/**
 * Ce qu'on ne répare pas — plan E2, § 8.2 : compté et remonté, jamais inventé.
 *
 * - `voided_only` : la commande vit, son seul BL est annulé ;
 * - `several_live_notes` : plus d'un BL vivant ;
 * - `dead_status` : `draft` ou `in_production`, qu'aucun chemin n'écrit ;
 * - `missing_instant` : le statut de la commande sans l'instant qui le date
 *   (`fulfilled` sans remise ni jour de réception, `ready` sans `ready_at`…) ;
 * - `atypical_number` : un numéro de commande sans `ORD-` ;
 * - `note_ahead_of_order` : le BL est plus avancé que sa commande (remis sur
 *   une commande annulée, préparé sur une commande seulement confirmée) ;
 * - `invalid_source` : une ligne ou une date de la commande que le BL refuse
 *   de recopier (ligne invalide, jour de réception mal formé).
 */
export const UNREPAIRABLE_REASONS = [
  "voided_only",
  "several_live_notes",
  "dead_status",
  "missing_instant",
  "atypical_number",
  "note_ahead_of_order",
  "invalid_source",
] as const;
export type UnrepairableReason = (typeof UNREPAIRABLE_REASONS)[number];

/**
 * Ce que l'alignement a décidé ; les BL de `writes` sont à écrire, `created`
 * est neuf. `completed` : l'état était juste, seul l'en-tête vide d'un BL
 * d'avant E4a a été rempli (plan E4a, § 1.2).
 */
export type DeliveryNoteAlignment =
  | { readonly change: "none" }
  | { readonly change: "created"; readonly created: DeliveryNote }
  | {
      readonly change: "advanced" | "voided" | "completed";
      readonly writes: readonly DeliveryNote[];
    }
  | { readonly change: "unrepairable"; readonly reason: UnrepairableReason };

/** L'identifiant d'un BL neuf, et l'instant d'une annulation. */
export interface AlignmentContext {
  readonly newId: () => string;
  readonly now: Date;
}

/** L'état que la commande demande à son BL, et ses instants. */
interface Target {
  readonly status: Exclude<DeliveryNoteStatus, "voided">;
  readonly plannedAt: Date;
  readonly preparedAt: Date | null;
  readonly handedOverAt: Date | null;
  readonly receivedOn: string | null;
}

const ORDER_OF: Readonly<Record<Exclude<DeliveryNoteStatus, "voided">, number>> = {
  planned: 0,
  prepared: 1,
  handed_over: 2,
};

const UNREPAIRABLE = (reason: UnrepairableReason): DeliveryNoteAlignment => ({
  change: "unrepairable",
  reason,
});
const NONE: DeliveryNoteAlignment = { change: "none" };

/**
 * **La règle unique du BL qui suit sa commande** (plan E2, § 8.2 et § 8.3) :
 * les gestes (bac fermé, remise, annulation) et le réconciliateur passent tous
 * par elle. Idempotente : une commande dont le BL dit déjà la vérité rend
 * `none`, et rien n'est réécrit.
 *
 * Hors de son champ, sans rien faire : une commande `placed` (son BL prévu
 * attend la re-clôture, E1), une commande sans ligne (rien à livrer).
 */
export function alignmentOf(
  order: FollowedOrder,
  notes: readonly DeliveryNote[],
  context: AlignmentContext,
): DeliveryNoteAlignment {
  if (order.status === "cancelled") {
    return voidingOf(notes, context.now);
  }
  if (order.status === "draft" || order.status === "in_production") {
    return UNREPAIRABLE("dead_status");
  }
  if (order.status === "placed" || order.lines.length === 0) {
    return NONE;
  }
  const target = targetOf(order);
  if (target === null) {
    return UNREPAIRABLE("missing_instant");
  }
  const live = notes.filter((note) => note.isLive);
  if (live.length > 1) {
    return UNREPAIRABLE("several_live_notes");
  }
  const [current] = live;
  if (current === undefined) {
    return creationOf(order, notes, target, context);
  }
  return advanceOf(order, current, target);
}

/** Commande annulée : tout BL vivant non remis passe `voided`. */
function voidingOf(notes: readonly DeliveryNote[], now: Date): DeliveryNoteAlignment {
  const live = notes.filter((note) => note.isLive);
  if (live.some((note) => note.status === "handed_over")) {
    return UNREPAIRABLE("note_ahead_of_order");
  }
  if (live.length === 0) {
    return NONE;
  }
  for (const note of live) {
    note.void(now);
  }
  return { change: "voided", writes: live };
}

function creationOf(
  order: FollowedOrder,
  notes: readonly DeliveryNote[],
  target: Target,
  context: AlignmentContext,
): DeliveryNoteAlignment {
  if (notes.length > 0) {
    return UNREPAIRABLE("voided_only");
  }
  if (!DeliveryNoteNumber.canNumber(order.orderNumber)) {
    return UNREPAIRABLE("atypical_number");
  }
  const created = DeliveryNote.planFromOrder(context.newId(), order, target.plannedAt);
  advance(created, target);
  return { change: "created", created };
}

function advanceOf(
  order: FollowedOrder,
  note: DeliveryNote,
  target: Target,
): DeliveryNoteAlignment {
  const from = note.status === "voided" ? null : ORDER_OF[note.status];
  if (from === null || from > ORDER_OF[target.status]) {
    return UNREPAIRABLE("note_ahead_of_order");
  }
  if (from === ORDER_OF[target.status]) {
    return completionOf(order, note);
  }
  if (note.status === "planned") {
    // Un BL prévu peut porter des lignes antérieures à une révision : il
    // s'aligne sur la commande avant d'avancer (plan E2, § 7 et § 8.2) — et
    // recopie ses totaux avec (plan E4a).
    note.replanFrom(order);
  } else if (!note.hasTerms) {
    note.completeTermsFrom(order);
  }
  advance(note, target);
  return { change: "advanced", writes: [note] };
}

/**
 * Un BL à l'état juste mais sans en-tête (écrit avant E4a) : il est complété
 * depuis la commande, remis compris (plan E4a, § 4, bloquant 3). Un BL prévu
 * se complète comme il se réécrit, par {@link DeliveryNote.replanFrom}.
 */
function completionOf(order: FollowedOrder, note: DeliveryNote): DeliveryNoteAlignment {
  // Un départ décidé (E6b) réécrit le BL prévu sur ce qui part, dès la décision.
  if (order.departureDecided === true && note.status === "planned" && !note.matches(order)) {
    note.replanFrom(order);
    return { change: "completed", writes: [note] };
  }
  if (note.hasTerms) {
    return NONE;
  }
  if (note.status === "planned") {
    note.replanFrom(order);
  } else {
    note.completeTermsFrom(order);
  }
  return { change: "completed", writes: [note] };
}

/** Avance un BL vivant jusqu'à la cible ; préparé à `ready_at` quand il est connu. */
function advance(note: DeliveryNote, target: Target): void {
  if (note.status === "planned" && target.preparedAt !== null) {
    note.prepare(target.preparedAt);
  }
  if (
    target.status === "handed_over" &&
    target.handedOverAt !== null &&
    target.receivedOn !== null
  ) {
    note.handOver(target.handedOverAt, target.receivedOn);
  }
}

/**
 * L'état demandé par la commande, et ses instants (plan E2, § 1 et § 7.2) :
 * `planned_at` = le premier instant connu ; `prepared_at` = `ready_at`, ou la
 * remise pour une commande remise sans bac. `null` si l'instant qui date le
 * statut manque.
 */
function targetOf(order: FollowedOrder): Target | null {
  const plannedAt = order.confirmedAt ?? order.readyAt ?? order.handedOverAt;
  const base = { plannedAt, preparedAt: null, handedOverAt: null, receivedOn: null };
  switch (order.status) {
    case "confirmed":
      return order.confirmedAt === null
        ? null
        : { ...base, plannedAt: order.confirmedAt, status: "planned" };
    case "ready":
      return order.readyAt === null || plannedAt === null
        ? null
        : { ...base, plannedAt, status: "prepared", preparedAt: order.readyAt };
    case "fulfilled":
      return fulfilledTarget(order, plannedAt);
    default:
      return null;
  }
}

function fulfilledTarget(order: FollowedOrder, plannedAt: Date | null): Target | null {
  if (order.handedOverAt === null || order.receivedOn === null || plannedAt === null) {
    return null;
  }
  return {
    status: "handed_over",
    plannedAt,
    preparedAt: order.readyAt,
    handedOverAt: order.handedOverAt,
    receivedOn: order.receivedOn,
  };
}
