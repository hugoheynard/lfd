import type { LoyaltyVoucherStatus } from "../entities/loyalty-voucher-shapes.js";

/**
 * **Ce que l'annulation d'une commande fait du bon qu'elle portait** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3b, C3b.3) —
 * pure : ni horloge, ni port.
 *
 * Lue deux fois, comme la règle de l'annulation : par l'aperçu du détail staff
 * (sans verrou) et par le geste (sous le verrou du titulaire), qui disent donc
 * la même chose.
 *
 * La règle ne remonte jamais la chaîne : elle ne regarde que **le bon de la
 * commande** et **son reliquat non refondu**. Défaire une commande dont le
 * reliquat a déjà servi ailleurs voudrait dire reprendre une valeur dépensée :
 * c'est un refus, que la commande met en mots.
 *
 * **Aucun point n'est recrédité, dans aucune issue** : les points ont été payés
 * une fois, par le parent ; un reliquat coûte zéro.
 */

/** Un bon, réduit à ce que la règle lit. */
export interface RestitutionVoucher {
  readonly status: LoyaltyVoucherStatus;
  readonly expiresAt: Date;
}

/** Ce qu'on sait du bon de la commande au moment de l'annuler. */
export interface RestitutionInput<V extends RestitutionVoucher> {
  /** Le bon que la commande portait. */
  readonly parent: V;
  /** Son reliquat non refondu, ou `null`. */
  readonly remainder: V | null;
  readonly now: Date;
  /**
   * Une AUTRE commande vivante porte le parent : il a déjà été rendu par cette
   * annulation, puis réengagé ailleurs.
   */
  readonly engagedElsewhere: boolean;
}

/**
 * Les six issues du plan (C3b.3), plus `already` :
 * - `returned` (cas 1, 2) : le parent redevient disponible ;
 * - `merged` (cas 3) : le reliquat disponible est refondu, le parent retrouve
 *   sa valeur et sa date limite d'origine ;
 * - `lapsed` (cas 4) : le parent est échu — rien n'est rendu ; `remainder` est
 *   le reliquat qu'il faut écrire expiré avec lui, s'il en a un ;
 * - `blocked` (cas 5, 6) : le reliquat a servi ailleurs, ou le staff l'a annulé ;
 * - `already` : rejeu — le bon n'est plus engagé par cette commande.
 */
export type RestitutionIssue<V extends RestitutionVoucher> =
  | { readonly kind: "returned" }
  | { readonly kind: "merged"; readonly remainder: V }
  | { readonly kind: "lapsed"; readonly remainder: V | null }
  | {
      readonly kind: "blocked";
      readonly cause: "remainder_engaged" | "remainder_cancelled";
      readonly remainder: V;
    }
  | { readonly kind: "already" };

/**
 * L'issue, dans l'ordre du plan. Échu se lit à l'horloge (`now >= expiresAt`) :
 * un reliquat porte la date limite de son parent, « parent échu » et « reliquat
 * échu » sont le même instant.
 */
export function voucherRestitutionOf<V extends RestitutionVoucher>(
  input: RestitutionInput<V>,
): RestitutionIssue<V> {
  const { parent, remainder, now } = input;
  if (parent.status !== "reserved" || input.engagedElsewhere) {
    return { kind: "already" };
  }
  if (now.getTime() >= parent.expiresAt.getTime()) {
    return { kind: "lapsed", remainder };
  }
  if (remainder === null) {
    return { kind: "returned" };
  }
  if (remainder.status === "reserved") {
    return { kind: "blocked", cause: "remainder_engaged", remainder };
  }
  if (remainder.status === "cancelled") {
    return { kind: "blocked", cause: "remainder_cancelled", remainder };
  }
  // `available` et non échu ; tout autre état est une incohérence, que la
  // refusion elle-même refuse (`mergeBackInto`).
  return { kind: "merged", remainder };
}
