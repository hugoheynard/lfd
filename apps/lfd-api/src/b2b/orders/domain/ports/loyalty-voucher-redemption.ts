/**
 * La commande sur laquelle un bon a servi, et ce qu'il y a imputé : de quoi
 * émettre son reliquat (plan des points, C5).
 */
export interface VoucherSettlement {
  readonly voucherId: string;
  /** La part imputée, HT — `Order.voucherDiscountCents`. */
  readonly appliedCents: number;
  readonly order: { readonly id: string; readonly number: string };
}

/**
 * Ce que l'annulation d'une commande a fait — ou fera — du bon qu'elle
 * portait (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3b.5).
 * Montants en centimes HT, l'unité du bon.
 *
 * - `returned` : le bon redevient disponible ;
 * - `merged` : son reliquat est refondu, le bon retrouve sa valeur et sa date ;
 * - `lapsed` : le bon est échu — rien n'est rendu ;
 * - `already` : le bon n'est plus engagé par cette commande (rejeu) ;
 * - `blocked` : le reste du bon a servi sur une commande vivante, ou a été
 *   annulé par l'équipe — la commande en fait un refus.
 */
export type VoucherRestitution =
  | {
      readonly kind: "returned" | "merged" | "lapsed";
      readonly voucherValueCents: number;
      readonly remainderValueCents: number | null;
      readonly expiresAt: Date;
    }
  | { readonly kind: "already" }
  | {
      readonly kind: "blocked";
      readonly cause: "remainder_engaged";
      readonly remainderValueCents: number;
      readonly order: { readonly id: string; readonly number: string };
    }
  | {
      readonly kind: "blocked";
      readonly cause: "remainder_cancelled";
      readonly remainderValueCents: number;
    };

/**
 * **Engager, rendre et solder un bon de fidélité** depuis la commande (plan
 * des points, C3, C4, C5).
 *
 * Déclaré par la commande, implémenté par la fidélité, relié par un module
 * `@Global` dans `appBootstrap/` : la fidélité importe déjà le module des
 * commandes, l'inverse ferait un cycle (§11 bis S8).
 *
 * 🔴 Chaque méthode prend le **verrou du titulaire** et rejoint l'unité de
 * travail ambiante : l'appelant l'appelle DANS la transaction qui écrit la
 * commande (réservation, reliquat d'une commande sans règlement) ou qui
 * l'annule (libération, restitution). Un échec annule tout — jamais un bon réservé sur une
 * commande qui n'existe pas, ni une commande annulée qui garde son bon.
 */
export abstract class LoyaltyVoucherRedemption {
  /**
   * `available → reserved`, sur le bon relu sous le verrou.
   *
   * @throws {ResourceNotFoundError} aucun bon de ce nom à cette personne.
   * @throws {BusinessError} déjà réservé (course perdue), annulé ou expiré.
   */
  abstract reserve(voucherId: string, holderUserId: string, now: Date): Promise<void>;

  /**
   * La commande qui le portait est annulée : `reserved → available`, ou
   * `→ expired` si sa date limite est passée (D7). Refuse un bon dont le
   * reliquat est déjà soldé (lot C3b) : seul {@link reinstate} sait le rendre.
   */
  abstract release(voucherId: string, now: Date): Promise<void>;

  /**
   * La commande qui portait le bon est annulée **par l'équipe** : le rendre,
   * refondre son reliquat, ou constater qu'il est éteint (lot C3b). Vérifie
   * que le bon est engagé par CETTE commande — sinon `already`, sans rien
   * écrire ni publier. `blocked` n'écrit rien non plus : à l'appelant d'en
   * faire un refus, qui annule sa transaction.
   */
  abstract reinstate(
    voucherId: string,
    order: { readonly id: string; readonly number: string },
    now: Date,
  ): Promise<VoucherRestitution>;

  /**
   * La commande est définitive : émet le reliquat, s'il en reste un — ou le
   * déclare éteint si le bon est échu (§11 bis B2). **Idempotent** : un bon
   * qui a déjà son reliquat n'en reçoit pas un second.
   */
  abstract settleRemainder(settlement: VoucherSettlement, now: Date): Promise<void>;
}
