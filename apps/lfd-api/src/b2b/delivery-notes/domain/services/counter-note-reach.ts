import type { DeliveryNoteState } from "../entities/delivery-note.js";

/** Ce que la règle lit de la commande, de sa remise et de ses bons. */
export interface CounterNoteSubject {
  /** Le mode d'acheminement de la commande — `pickup` : un retrait au comptoir. */
  readonly fulfillmentMethod: string;
  /** Le retrait a attesté la remise (son canal, `OrderHandoverHistoryReader`). */
  readonly handedOver: boolean;
  readonly notes: readonly DeliveryNoteState[];
}

/**
 * Le verdict : le bon à imprimer ; `not_yet` — remise attestée, mais le BL
 * (écrit par le commerce à la livraison du fait de remise) n'est pas encore
 * là, l'écran réessaie ; `out_of_reach` — pas un retrait remis.
 */
export type CounterNoteReach =
  | { readonly kind: "note"; readonly note: DeliveryNoteState }
  | { readonly kind: "not_yet" }
  | { readonly kind: "out_of_reach" };

/**
 * **Quel BL chiffré le comptoir peut-il imprimer ?** (plan du jour J, lot L6 :
 * « le bon remis au client », Hugo, 2026-11-02) — le BL **remis** d'un
 * **retrait** : c'est le comptoir qui l'a remis (une livraison se remet à la
 * porte). Le plus récent s'il y en a plusieurs (un reste remis après la
 * commande).
 *
 * Le droit du poste (`handover_counter`) ne s'étend pas aux autres bons —
 * prix, remises et TVA d'une commande livrée ou pas encore remise restent
 * sous `b2b_orders`.
 */
export function counterNoteReach(subject: CounterNoteSubject): CounterNoteReach {
  if (subject.fulfillmentMethod !== PICKUP) {
    return { kind: "out_of_reach" };
  }
  const handed = subject.notes
    .filter((note) => note.status === "handed_over" && note.handedOverAt !== null)
    .sort((a, b) => (b.handedOverAt?.getTime() ?? 0) - (a.handedOverAt?.getTime() ?? 0));
  const latest = handed[0];
  if (latest !== undefined) {
    return { kind: "note", note: latest };
  }
  return subject.handedOver ? { kind: "not_yet" } : { kind: "out_of_reach" };
}

const PICKUP = "pickup";
