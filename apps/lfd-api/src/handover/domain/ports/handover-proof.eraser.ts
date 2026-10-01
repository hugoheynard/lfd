import type { HandoverProof } from "../entities/handover-proof.js";

/**
 * **Effacer les pièces des remises à la porte** — la seule exception à « rien
 * à supprimer » de `HandoverProofRepository`, et elle est voulue (Hugo,
 * 2026-10-01) : ces pièces portent des données personnelles (un nom, une
 * photo, une signature), et ce qui en porte doit pouvoir partir — à la
 * conservation échue, ou à la demande d'une personne.
 *
 * Un port à part, et non deux méthodes de plus sur le dépôt : le geste qui
 * grave n'a aucune raison de pouvoir effacer.
 *
 * ⚠️ L'attestation (`order_handover`) n'est PAS effacée : qui a remis, quand,
 * par quel geste reste opposable ; seules les pièces qui la prouvaient partent.
 */
export abstract class HandoverProofEraser {
  /** Les pièces gravées avant cet instant, les plus anciennes d'abord. */
  abstract recordedBefore(cutoff: Date): Promise<readonly HandoverProof[]>;

  /**
   * Efface la ligne, dans la transaction ambiante. `false` : elle n'existait
   * plus — un autre effacement est passé, et il a écrit son fait.
   */
  abstract erase(orderId: string): Promise<boolean>;
}
