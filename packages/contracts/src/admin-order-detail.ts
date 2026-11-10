import { z } from "zod";

import type { AdminOrderCardIncrease } from "./admin-order-card-increase.js";
import type { OrderSaleUnit, OrderView } from "./order.js";
import type { OrderClientele } from "./order-handover.js";
import type { AdminOrderRevisability } from "./order-revision.values.js";

/**
 * **D'où vient une saisie de l'équipe** (Hugo, 2026-11-04) : « Prise au
 * comptoir » ou « Prise par le commercial ». Réservé au back-office : la
 * boutique continue de dire « Prise par La Folie Coffee », et ce champ
 * n'entre dans aucune vue client.
 */
export type AdminOrderEntryOrigin = "counter" | "commercial";

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
   * D'où vient la saisie de l'équipe, ou `null` : commande du client, ou
   * saisie d'avant le 2026-11-04 dont on ne sait pas d'où elle vient. Un
   * « Retrait immédiat » sans origine se lit `counter` — il n'existe qu'au
   * comptoir.
   */
  readonly entryOrigin: AdminOrderEntryOrigin | null;
  /**
   * **Peut-on l'annuler, et sinon pourquoi** (doc
   * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.8). Calculée par
   * la même règle que le refus de `POST /admin/orders/:id/cancel`, mais sans
   * verrou : c'est un affichage. Le refus, lui, se reprend sous verrou — un
   * bouton actif peut donc encore rendre un 409, avec la même phrase.
   */
  readonly cancellability: AdminOrderCancellability;
  /**
   * **Les demandes de remboursement par carte de la commande** (plan
   * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
   * §5.3) — terminées comprises, de la plus ancienne à la plus récente ; vide
   * quand aucun remboursement n'a été demandé. Remplace `refund` (une demande
   * au plus) au lot P1.c : une commande en porte une par paiement encaissé.
   */
  readonly refundRequests: readonly AdminRefundRequest[];
  /**
   * **Peut-on la modifier, et sinon pourquoi** (voir
   * `documentation/commandes/modification/modifier-une-commande.md`, § 2.3 « Les règles », R1) — la
   * règle de l'équipe, par la même recomposition que
   * `POST /admin/orders/:id/revisions`, sans verrou : c'est un affichage.
   */
  readonly revisability: AdminOrderRevisability;
  /** La révision courante : `0` à la passation, `+1` à chaque modification. */
  readonly revision: number;
  /**
   * **Manque signalé — décision attendue** (lot E6a,
   * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3) : ce que le
   * colisage a figé au signalement en vigueur ; `null` = aucun manque signalé.
   */
  readonly shortfall: AdminOrderShortfall | null;
  /**
   * **La hausse par carte qui attend** (doc
   * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.10) — le
   * projet vivant (`awaiting_payment | ready | stalled`), ou `null`.
   */
  readonly cardIncrease: AdminOrderCardIncrease | null;
}

/** Le manque signalé : l'instant ISO, et, par article, la quantité due et celle au bac. */
export interface AdminOrderShortfall {
  readonly reportedAt: string;
  readonly lines: readonly AdminOrderShortfallLine[];
  /**
   * **La décision du départ** (lot E6b) — `null` tant qu'elle est attendue.
   * Une fois prise, elle est définitive : le bandeau dit ce qui est parti et
   * que le reste est abandonné.
   */
  readonly decision: AdminOrderShortfallDecision | null;
}

/**
 * Ce que devient le reste d'un départ incomplet. `abandoned` seul : « à
 * relivrer » arrive avec le reliquat (E7, plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 13).
 */
export const shortfallRemainderSchema = z.literal("abandoned");
export type ShortfallRemainder = z.infer<typeof shortfallRemainderSchema>;

/** La décision prise : l'instant ISO, et le sort du reste. */
export interface AdminOrderShortfallDecision {
  readonly decidedAt: string;
  readonly remainder: ShortfallRemainder;
  /**
   * **Le client prévenu** (lot E6d,
   * plan E6d (`documentation/commandes/bon-de-livraison.md`)) — `null` tant que
   * personne ne lui a écrit. Une fois par décision : « Client prévenu le … par … ».
   */
  readonly customerNotice: AdminShortfallCustomerNotice | null;
}

/** L'instant ISO de l'envoi, et qui l'a fait (« Prénom Nom », `null` = fiche introuvable). */
export interface AdminShortfallCustomerNotice {
  readonly notifiedAt: string;
  readonly notifiedByName: string | null;
}

/**
 * Réponse de `GET /admin/orders/:id/shortfall-letter` (lot E6d) : la
 * proposition que l'équipe relit, rédigée par le dictionnaire des e-mails
 * dans la langue de la commande.
 */
export interface AdminShortfallLetterDraft {
  readonly message: string;
}

/**
 * Corps de `POST /admin/orders/:id/shortfall-letter` (lot E6d) : le texte
 * RELU, celui qui part. La forme seulement — le vide et la longueur se
 * refusent au domaine (`ShortfallLetter`).
 */
export const adminShortfallLetterPayloadSchema = z.object({
  message: z.string(),
});
export type AdminShortfallLetterPayload = z.infer<typeof adminShortfallLetterPayloadSchema>;

/**
 * Corps de `POST /admin/orders/:id/shortfall-decision` (lot E6b). Les
 * quantités ne voyagent pas : ce qui part est ce que le colisage a figé au
 * signal en vigueur, relu par le serveur sous verrou.
 *
 * `rank` : l'envoi dont on décide (plan E7 reliquat, lot LB) — absent = 1, la
 * commande elle-même ; au-delà, un reliquat.
 */
export const adminShortfallDecisionPayloadSchema = z.object({
  remainder: shortfallRemainderSchema,
  rank: z.number().int().positive().optional(),
});
export type AdminShortfallDecisionPayload = z.infer<typeof adminShortfallDecisionPayloadSchema>;

/**
 * Corps de `POST /admin/counter/orders/:orderId/incomplete-handover` — le
 * départ incomplet décidé au comptoir (plan
 * `documentation/commandes/reliquat/reliquat.md`, §2.2.2 et
 * §2.2.3, Hugo, 2026-11-03). Aucune quantité, aucun rang : ce qui part est ce
 * qui est au bac de la commande, relu par le serveur sous verrou. Le sort du
 * reste est un paramètre pour que le reliquat (lot R) s'y ajoute sans
 * toucher au droit ; `abandoned` seul aujourd'hui.
 */
export const counterIncompleteHandoverPayloadSchema = z.object({
  remainder: shortfallRemainderSchema,
  /**
   * Le jeton du QR lu au scan, s'il l'a été (Hugo, 2026-11-03) : la remise
   * est alors gravée `scan`, sinon `manual`. Un jeton d'une autre commande
   * est refusé (`handover.counter.token_mismatch`), rien n'est écrit.
   */
  token: z.string().min(1).optional(),
});
export type CounterIncompleteHandoverPayload = z.infer<
  typeof counterIncompleteHandoverPayloadSchema
>;

export interface AdminOrderShortfallLine {
  readonly sku: string;
  /** `due` et `packed` sont des grammes si `saleUnit = "weight"` (P6 de `vente-au-poids.md`). */
  readonly due: number;
  readonly packed: number;
  readonly saleUnit: OrderSaleUnit;
}

/**
 * L'état d'une demande de remboursement par carte (plan M2, §3.4) :
 * `to_issue` pas encore acceptée par le prestataire ; `issued` envoyée, en
 * attente de la banque ; `refunded` rendue ; `stopped` arrêtée — à relancer
 * ou à rendre autrement ; `settled_elsewhere` rendue hors de la plateforme.
 */
export type AdminRefundRequestState =
  "to_issue" | "issued" | "refunded" | "stopped" | "settled_elsewhere";

/** Une demande de remboursement, telle que le bandeau du back-office la lit (§5.3). */
export interface AdminRefundRequest {
  readonly id: string;
  /** Le paiement qu'elle rembourse. */
  readonly paymentId: string;
  /** `remainder` : le reste du paiement ; `amount` : un montant exact. */
  readonly form: "remainder" | "amount";
  /** `return` : la vente n'a pas lieu ; `adjustment` : le montant dû a baissé. */
  readonly nature: "return" | "adjustment";
  /** Le code de la demande (`cancellation`, `paid_after_cancellation`…). */
  readonly reason: string;
  readonly state: AdminRefundRequestState;
  /** Ce qui a été promis, en centimes TTC. */
  readonly announcedCents: number;
  /** Ce que le prestataire a rendu pour la génération courante, `null` avant émission. */
  readonly issuedCents: number | null;
  /** Instant ISO 8601. */
  readonly requestedAt: string;
  /** Instant ISO 8601 ; `null` avant émission. */
  readonly issuedAt: string | null;
  /** Appels faits pour la génération courante. */
  readonly attempts: number;
  /** +1 à chaque « Relancer » d'une demande arrêtée. */
  readonly generation: number;
  /** La phrase du serveur sur le dernier échec, ou `null`. */
  readonly lastFailure: string | null;
  /** « Relancer » a-t-il un sens maintenant — toute la règle, bail compris (§3.4). */
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
