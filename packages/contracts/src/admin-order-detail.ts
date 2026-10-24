import { z } from "zod";

import type { OrderView } from "./order.js";
import type { OrderClientele } from "./order-handover.js";
import type { AdminOrderRevisability } from "./order-revision.values.js";

/**
 * **Le détail staff d'une commande** — `GET /admin/orders/:id`.
 *
 * Une vue à part, qui ÉTEND `OrderView` au lieu d'y ajouter des champs : ce
 * qu'elle ajoute (l'e-mail et le téléphone de la personne) ne doit jamais
 * atteindre une route client. Les routes client rétrécissent déjà `OrderView`
 * champ par champ (`toCustomerOrder`, vérifié le 2026-10-12) ; un champ posé ici
 * n'y entre donc pas, et rien n'oblige à y penser.
 */
export interface AdminOrderView extends OrderView {
  /**
   * QUI a commandé, figé à la passation : `pro` ou `public`. `null` = commande
   * d'avant la distinction, jamais rattrapée — l'écran n'affiche alors aucun
   * badge plutôt que de le deviner (cf. `AdminOrderRow.clientele`).
   */
  readonly clientele: OrderClientele | null;
  /** La personne qui l'a passée, et pour qui — cf. {@link AdminOrderPlacedByView}. */
  readonly placedBy: AdminOrderPlacedByView;
  /**
   * **Peut-on l'annuler, et sinon pourquoi** (doc
   * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.8). Calculée par
   * la même règle que le refus de `POST /admin/orders/:id/cancel`, mais sans
   * verrou : c'est un affichage. Le refus, lui, se reprend sous verrou — un
   * bouton actif peut donc encore rendre un 409, avec la même phrase.
   */
  readonly cancellability: AdminOrderCancellability;
  /**
   * **L'argent à rendre d'une commande annulée** (doc
   * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C4, C4.9) —
   * `null` quand aucun remboursement n'a été demandé.
   */
  readonly refund: AdminOrderRefund | null;
  /**
   * **Peut-on la modifier, et sinon pourquoi** (plan
   * `documentation/commandes/modification/plan-modifier-une-commande.md`, R1, §6) — la
   * règle de l'équipe, par la même recomposition que
   * `POST /admin/orders/:id/revisions`, sans verrou : c'est un affichage.
   */
  readonly revisability: AdminOrderRevisability;
  /** La révision courante : `0` à la passation, `+1` à chaque modification. */
  readonly revision: number;
  /**
   * **Manque signalé — décision attendue** (lot E6a,
   * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 3) : ce que le
   * colisage a figé au signalement en vigueur ; `null` = aucun manque signalé.
   */
  readonly shortfall: AdminOrderShortfall | null;
}

/** Le manque signalé : l'instant ISO, et, par article, la quantité due et celle au bac. */
export interface AdminOrderShortfall {
  readonly reportedAt: string;
  readonly lines: readonly AdminOrderShortfallLine[];
}

export interface AdminOrderShortfallLine {
  readonly sku: string;
  readonly due: number;
  readonly packed: number;
}

/**
 * L'état d'un remboursement demandé, LU au carnet (jamais stocké) :
 * `to_issue` pas encore accepté par Stripe ; `issued` envoyé, en attente de
 * la banque ; `refunded` rendu ; `failed` échoué chez Stripe — à relancer ou
 * à régler autrement.
 */
export type AdminOrderRefundState = "to_issue" | "issued" | "refunded" | "failed";

export interface AdminOrderRefund {
  readonly state: AdminOrderRefundState;
  /** Ce que l'annulation a promis, en centimes TTC. */
  readonly announcedCents: number;
  /** Ce que Stripe a rendu pour la génération courante, `null` avant émission. */
  readonly issuedCents: number | null;
  /** Instant ISO 8601. */
  readonly requestedAt: string;
  /** Instant ISO 8601 ; `null` avant émission. */
  readonly issuedAt: string | null;
  /** Appels faits pour la génération courante. */
  readonly attempts: number;
  /** La phrase du serveur sur le dernier échec, ou `null`. */
  readonly lastFailure: string | null;
  /** « Relancer » a-t-il un sens maintenant (à émettre ou échoué, et personne ne le traite) ? */
  readonly retryable: boolean;
}

/**
 * `reason` est la phrase du serveur, à montrer telle quelle sous le bouton
 * désactivé : elle nomme le cas et le geste de sortie.
 *
 * `voucher` (lot C3b) : ce que l'annulation fera du bon de fidélité que la
 * commande porte, `null` sans bon.
 *
 * `refund` (lot C4, C4.9) : l'argent payé par carte qui sera rendu, avec sa
 * phrase — `null` hors commande payée par carte.
 */
export type AdminOrderCancellability =
  | {
      readonly cancellable: true;
      readonly voucher: AdminCancellationVoucher | null;
      readonly refund: AdminCancellationRefund | null;
    }
  | { readonly cancellable: false; readonly reason: string };

/**
 * Ce que l'annulation fera du bon — calculé par la même règle que le geste,
 * sans verrou (doc `documentation/commandes/annulation/fusion-du-bon.md`, C3b.7).
 * `sentence` est la phrase du serveur, à montrer telle quelle dans la
 * confirmation ; les montants (centimes HT, l'unité du bon) servent à la mise
 * en forme. `expiresAt` : instant ISO 8601, la date limite d'origine du bon.
 */
export type AdminCancellationVoucher =
  | {
      readonly outcome: "returned";
      readonly voucherValueCents: number;
      readonly expiresAt: string;
      readonly sentence: string;
    }
  | {
      readonly outcome: "merged";
      readonly voucherValueCents: number;
      readonly remainderValueCents: number;
      readonly expiresAt: string;
      readonly sentence: string;
    }
  | {
      readonly outcome: "lapsed";
      readonly voucherValueCents: number;
      readonly expiresAt: string;
      readonly sentence: string;
    };

/**
 * Ce que l'annulation d'une commande payée rendra (lot C4, C4.9) :
 * `amountCents` le reste payé par carte et pas encore rendu (centimes TTC),
 * `0` s'il a déjà été rendu en entier ; `sentence` la phrase du serveur.
 */
export interface AdminCancellationRefund {
  readonly amountCents: number;
  readonly sentence: string;
}

/**
 * Le corps de `POST /admin/orders/:id/cancel` — la FORME seule. Le motif vide
 * ou trop long est refusé par le domaine (`CancellationReason`), avec sa
 * phrase : le contrôleur ne revalide pas ce que l'entité garantit.
 */
export const adminCancelOrderPayloadSchema = z.object({
  /** Le motif — obligatoire, jamais montré au client. */
  reason: z.string(),
});
export type AdminCancelOrderPayload = z.infer<typeof adminCancelOrderPayloadSchema>;

/**
 * **La personne derrière la commande**, lue aujourd'hui (pas figée) : un
 * commercial qui rappelle un client veut son numéro actuel.
 *
 * Quand l'équipe a saisi la commande, `customer` reste le client pour le compte
 * duquel elle l'a été — et `staffName` nomme le membre de l'équipe.
 */
export interface AdminOrderPlacedByView {
  readonly customer: AdminOrderCustomerView;
  /** La société cliente, ou `null` sur une commande personnelle. */
  readonly company: AdminOrderCompanyView | null;
  /**
   * « Prénom Nom » du membre de l'équipe qui a saisi la commande, `null` si
   * elle ne l'a pas été — ou si l'annuaire ne le nomme plus (l'écran garde
   * alors « saisie par l'équipe », sans inventer de nom).
   */
  readonly staffName: string | null;
}

/** Le client (`User` du commerce) qui a passé la commande. */
export interface AdminOrderCustomerView {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** `null` = aucun numéro renseigné (la colonne vaut `""` en base). */
  readonly phone: string | null;
}

/** La société, sous ses deux noms. */
export interface AdminOrderCompanyView {
  readonly id: string;
  readonly raisonSociale: string;
  /** `null` = pas d'enseigne distincte de la raison sociale. */
  readonly enseigne: string | null;
}
