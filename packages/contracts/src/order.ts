import { z } from "zod";

import type { OrderLinePricingTrace } from "./pricing.js";

import {
  billingAddressPayloadSchema,
  type BillingAddressPayload,
  deliveryContactSchema,
  type DeliveryContact,
  type FulfillmentWindow,
  fulfillmentWindowSchema,
} from "./address.js";
import type { CartAdjustment } from "./cart-adjustment.js";

/**
 * Contrat de fil des **commandes** B2B.
 *
 * Le client n'envoie que ce qu'il **décide** : l'acheminement (coursier vers une
 * adresse, ou retrait au labo), une date souhaitée, une note, et des lignes
 * `{sku, quantité}`. Il n'envoie **jamais** de prix : le serveur les ré-résout
 * depuis le catalogue, et **déduit la zone** (donc le frais) du code postal de
 * l'adresse livrée. Les montants apparaissent donc seulement dans les vues de
 * **lecture**.
 *
 * **Zéro friction** : `companyId` est **optionnel**. Sans entreprise, la commande
 * appartient au client connecté et se règle par carte (`per_order`). Avec une
 * entreprise active à terme différé, elle est facturée hors ligne.
 */

/** Cycle de vie d'une commande (aligné sur l'enum Prisma `OrderStatus`). */
export const orderStatusSchema = z.enum([
  "draft",
  "placed",
  "confirmed",
  "in_production",
  "fulfilled",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * État du **règlement** d'une commande (aligné sur l'enum Prisma `PaymentStatus`).
 * Découplé de {@link OrderStatus} (l'avancement de production). `not_required` =
 * facturée sur terme (net60/90/mensuel) ; `pending` = carte en attente
 * (`per_order`) ; `paid` = encaissée ; `failed`/`refunded` = échec / remboursée.
 */
export const paymentStatusSchema = z.enum([
  "not_required",
  "pending",
  "paid",
  "failed",
  "refunded",
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Mode d'**acheminement** d'une commande (aligné sur l'enum Prisma
 * `FulfillmentMethod`). `delivery` = **coursier** vers une zone + adresse libre ;
 * `pickup` = **retrait** au point de retrait (labo).
 */
export const fulfillmentMethodSchema = z.enum(["delivery", "pickup"]);
export type FulfillmentMethod = z.infer<typeof fulfillmentMethodSchema>;

/** Une ligne demandée : un SKU et une quantité entière positive. */
export const orderLineInputSchema = z.object({
  sku: z.string().trim().min(1, "sku requis"),
  quantity: z.number().int().positive("quantité ≥ 1"),
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

/**
 * **Ce que dit un panier**, indépendamment de qui l'envoie : l'acheminement, la
 * date souhaitée, la note et les lignes.
 *
 * **Une commande dit toujours QUAND et OÙ.** `requestedDeliveryDate` est une
 * date ISO (`YYYY-MM-DD`) obligatoire, et l'acheminement est complet : en
 * **coursier** l'adresse livrée est fournie (carnet ou saisie à la volée), en
 * **retrait** le point est choisi. Les deux étaient facultatifs, et le résultat
 * était une commande que la production ne voyait pas : sans date elle n'entre
 * dans aucune journée de fabrication, et un point implicite se découvre au
 * comptoir. Un défaut serveur silencieux fait porter au labo une décision que
 * personne n'a prise.
 *
 * Les lignes sont non vides et dédupliquées par SKU côté client (le serveur
 * refuse un panier vide de toute façon).
 *
 * **La zone n'est pas envoyée** : elle se **déduit** du code postal de l'adresse
 * livrée (`resolveForPostalCode` — code exact ou préfixe de secteur, le plus long
 * gagne). La laisser au client rendait le frais négociable : il suffisait
 * d'annoncer la zone la moins chère avec une adresse ailleurs. Un secteur est une
 * propriété de l'adresse, pas une option de commande.
 *
 * Extrait pour que la surface staff (`admin-order.ts`) décrive le même panier
 * sans le redéclarer. Deux copies de cette forme dériveraient — et la seconde
 * serait celle du back-office, donc celle qu'on teste le moins.
 */
export const orderContentShape = {
  /** Mode d'acheminement. Défaut `pickup` (aucun extra requis). */
  fulfillmentMethod: fulfillmentMethodSchema.default("pickup"),
  /** Adresse livrée (coursier) — requise si `delivery` ; sa zone est déduite. */
  deliveryAddress: billingAddressPayloadSchema.nullable().default(null),
  /**
   * L'adresse **du carnet** dont elle provient, quand elle en vient. `null` =
   * dictée à la volée.
   *
   * Le snapshot postal ne suffit pas : les consignes du site (contact, exigence
   * de signature, créneau) vivent sur la ligne du carnet, et sans son identité
   * le serveur ne peut pas savoir de quel réglage la commande s'écarte. La
   * retrouver en comparant les champs postaux serait deviner.
   */
  deliveryAddressId: z.string().trim().nullable().default(null),
  /** Point de retrait — requis si `pickup`, ignoré sinon. */
  pickupAddressId: z.string().trim().nullable().default(null),
  /** Jour de retrait/livraison. **Obligatoire** : c'est la journée de production. */
  requestedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "date de retrait/livraison requise (AAAA-MM-JJ)"),
  /**
   * La **tranche horaire demandée** — en retrait comme en livraison, c'est la
   * même forme et le même engagement : on s'y tient.
   *
   * En retrait, elle doit tenir dans l'une des fenêtres d'ouverture du point
   * (pro ou public) ; le serveur refuse sinon, parce qu'accepter une heure de
   * porte close est une promesse qu'on ne peut pas tenir.
   *
   * `null` = aucune tranche demandée. L'écran propose celle du réglage, mais un
   * client peut n'en vouloir aucune.
   */
  requestedWindow: fulfillmentWindowSchema.nullable().optional(),
  /**
   * Qui recevra, et faut-il une signature. Les deux **valeurs résolues** telles
   * que l'écran les montre — pas des drapeaux d'override.
   *
   * La provenance n'est pas envoyée : le serveur la **déduit** en comparant au
   * réglage. Un client qui envoie exactement le défaut n'a rien décidé, et un
   * champ « j'ai modifié » séparé de la valeur finirait par la contredire.
   *
   * **Absent ≠ `null`.** Absent = « je ne me prononce pas », et le serveur
   * applique le réglage du client. `null` = « explicitement aucun », donc un
   * override si le réglage en proposait un. Sans cette distinction, un écran qui
   * ignore encore le champ effacerait le contact d'un compte qui en a un — et le
   * bon de livraison partirait en tournée en disant « aucun contact ».
   */
  deliveryContact: deliveryContactSchema.nullable().optional(),
  signatureRequired: z.boolean().optional(),
  note: z.string().default(""),
  lines: z.array(orderLineInputSchema).min(1, "au moins une ligne"),
} as const;

/**
 * Le coursier exige une adresse. Prédicat partagé par les deux surfaces : la
 * règle ne dépend pas de qui saisit.
 */
export function hasAddressWhenDelivered(content: {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
}): boolean {
  return content.fulfillmentMethod !== "delivery" || content.deliveryAddress !== null;
}

/**
 * D'où vient une valeur d'acheminement portée par la commande.
 *
 * `default` = reprise telle quelle du réglage du client (adresse) ou du point de
 * retrait ; `override` = quelqu'un l'a changée POUR cette commande.
 *
 * Ce n'est pas de la décoration. Un réglage est un **préremplissage**, jamais une
 * contrainte : tout est modifiable à la commande. Ce qu'on doit pouvoir dire
 * ensuite, c'est si la valeur a été **subie ou choisie** — le fournil et le
 * livreur ne traitent pas de la même façon « le client a toujours ça » et « le
 * client a demandé ça aujourd'hui ». D'où une provenance par champ, et non un
 * drapeau global sur la commande.
 */
export const fulfillmentSourceSchema = z.enum(["default", "override"]);
export type FulfillmentSource = z.infer<typeof fulfillmentSourceSchema>;

/**
 * Une valeur d'acheminement **figée sur la commande**, avec sa provenance.
 *
 * Figée comme les prix, et pour la même raison : le contact d'une adresse, ses
 * horaires ou son exigence de signature peuvent changer demain. Aller les
 * relire au moment d'imprimer ferait dire à un bon déjà sorti autre chose que
 * le papier qui est au fournil. Une commande est un fait clos ; ce qui bouge
 * après passe par un **avenant** (cf. `architecture-commande-immuable-avenants`).
 */
export interface FulfillmentDecision<T> {
  readonly value: T;
  readonly source: FulfillmentSource;
}

/**
 * Le retrait exige un point. Symétrique du prédicat ci-dessus, et pour la même
 * raison : l'acheminement d'une commande se décide à la commande.
 *
 * Le serveur savait retomber sur le point marqué par défaut. C'était commode et
 * faux : il y a plusieurs points de retrait, et « celui par défaut » est un
 * réglage d'aujourd'hui qui peut changer entre la commande et le retrait. Le
 * client choisit — l'écran peut très bien lui présenter le défaut coché.
 */
export function hasPickupPointWhenPickedUp(content: {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly pickupAddressId: string | null;
}): boolean {
  return content.fulfillmentMethod !== "pickup" || content.pickupAddressId !== null;
}

/** Le message et le chemin du refus ci-dessus — écrits une fois (cf. `deliveryAddressIssue`). */
export function pickupPointIssue(): { message: string; path: PropertyKey[] } {
  return { message: "point de retrait requis", path: ["pickupAddressId"] };
}

/**
 * Le message et le chemin du refus ci-dessus — écrits une fois.
 *
 * Une **fonction** et non une constante : Zod veut un `path` mutable, et deux
 * schémas partageant le même tableau partageraient un objet qu'il se réserve le
 * droit de toucher.
 */
export function deliveryAddressIssue(): { message: string; path: PropertyKey[] } {
  return { message: "adresse de livraison requise", path: ["deliveryAddress"] };
}

/**
 * Charge de passation d'une commande **par le client lui-même**. `companyId` est
 * **optionnel** : `null` = commande personnelle (le client connecté). La surface
 * staff, elle, exige une société — cf. `admin-order.ts`.
 */
export const placeOrderPayloadSchema = z
  .object({
    /** Entreprise cliente, ou `null` = commande personnelle (client connecté). */
    companyId: z.string().trim().min(1).nullable().default(null),
    ...orderContentShape,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue());
export type PlaceOrderPayload = z.infer<typeof placeOrderPayloadSchema>;

/**
 * **D'où vient** une commande — dérivé au serveur, jamais envoyé.
 *
 * Ce n'est pas une nature de commande, c'est une porte d'entrée : les lignes,
 * les prix, la TVA et le retrait sont les mêmes dans les trois cas. En faire une
 * union discriminée aurait obligé chaque lecteur à narrower pour n'apprendre
 * rien, et aurait fait descendre jusqu'à l'app client une distinction qui ne la
 * concerne pas.
 *
 * - `self_service` — le client l'a passée lui-même ;
 * - `back_office` — un membre de l'équipe l'a saisie pour lui (au téléphone,
 *   en clientèle) ;
 * - `recurring` — un panier récurrent l'a produite.
 *
 * Les deux colonnes qui le produisent (`placed_by_staff_id`, `from_subscription_id`)
 * restent la source de vérité : `origin` est un mot pour l'écran, pas un
 * troisième endroit où l'information vivrait.
 */
export const orderOriginSchema = z.enum(["self_service", "back_office", "recurring"]);
export type OrderOrigin = z.infer<typeof orderOriginSchema>;

/** Libellés d'écran — le code parle anglais, l'interface parle français. */
export const ORDER_ORIGIN_LABELS: Readonly<Record<OrderOrigin, string>> = {
  self_service: "Passée par le client",
  back_office: "Saisie par l'équipe",
  recurring: "Panier récurrent",
};

// ─── Vues de LECTURE ─────────────────────────────────────────────────────────

/** Une ligne (SKU + quantité) figurant dans un écart vis-à-vis d'un gabarit récurrent. */
const recurringDeltaLineSchema = z.object({
  sku: z.string(),
  quantity: z.number().int().nonnegative(),
});
export type RecurringDeltaLine = z.infer<typeof recurringDeltaLineSchema>;

/**
 * Écart d'une commande **issue d'un panier récurrent** vis-à-vis de son gabarit :
 * `added` = lignes ajoutées pour cette échéance (pill « + »), `removed` = lignes
 * retirées (pill « − »). Absent tant qu'aucune commande n'est produite par un
 * abonnement (le planificateur les stampera).
 */
export const recurringDeltasSchema = z.object({
  added: z.array(recurringDeltaLineSchema),
  removed: z.array(recurringDeltaLineSchema),
});
export type RecurringDeltas = z.infer<typeof recurringDeltasSchema>;

/** Une ligne de commande, telle que renvoyée (montants en centimes, snapshots). */
export interface OrderLineView {
  readonly sku: string;
  readonly productName: string;
  readonly unitPriceCents: number;
  readonly vatRate: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
  /**
   * **Pourquoi ce prix** — la trace figée à la passation.
   *
   * `null` sur une commande passée avant que la trace n'existe. L'écran doit
   * alors se taire plutôt qu'afficher « aucune altération » : ce serait
   * affirmer une chose qu'on ne sait pas, sur les seules commandes qu'on ne
   * peut plus vérifier.
   */
  readonly pricing: OrderLinePricingTrace | null;
}

/**
 * L'acheminement **convenu** d'une commande — figé, avec la provenance de chaque
 * valeur (cf. {@link FulfillmentDecision}).
 *
 * `window` peut être `null` : aucune tranche demandée. `contact` aussi : une
 * commande retirée n'a personne à appeler, et une livraison peut partir sans
 * contact — la fiche le dit alors en toutes lettres.
 */
export interface OrderFulfillment {
  readonly window: FulfillmentDecision<FulfillmentWindow | null>;
  readonly contact: FulfillmentDecision<DeliveryContact | null>;
  readonly signatureRequired: FulfillmentDecision<boolean>;
}

/**
 * Le même bloc, en schéma — le JSON figé est **validé** à la relecture, jamais
 * casté : une commande d'avant la colonne n'en porte pas, et une forme
 * inattendue ne doit pas remonter en vue.
 */
const decisionOf = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, source: fulfillmentSourceSchema });

export const orderFulfillmentSchema = z.object({
  window: decisionOf(fulfillmentWindowSchema.nullable()),
  contact: decisionOf(deliveryContactSchema.nullable()),
  signatureRequired: decisionOf(z.boolean()),
});

/** Une commande, telle que la liste/le détail l'affichent. */
export interface OrderView {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  /** État du règlement (découplé de `status`, l'avancement de production). */
  readonly paymentStatus: PaymentStatus;
  readonly requestedDeliveryDate: string | null;
  /** Mode d'acheminement de cette commande. */
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Adresse de livraison d'entreprise (héritage), ou `null`. */
  readonly deliveryAddressId: string | null;
  /** Adresse de livraison **libre figée** (coursier), ou `null` en retrait. */
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Adresse de retrait **figée** au moment de la commande, ou `null` en livraison. */
  readonly pickupAddress: BillingAddressPayload | null;
  /**
   * Ce qui a été **convenu** pour l'acheminement, figé à la commande, chaque
   * valeur avec sa provenance : la tranche horaire demandée, qui reçoit, et si
   * une signature est exigée.
   *
   * Figé et non relu : ces trois valeurs viennent de réglages qui peuvent
   * changer demain. Un bon de livraison déjà imprimé ne doit pas se mettre à
   * dire autre chose que le papier qui est parti en tournée.
   */
  readonly fulfillment: OrderFulfillment;
  readonly note: string;
  /** Sous-total marchandises **HT**, en centimes. */
  readonly subtotalCents: number;
  /** Remise (retrait) déduite du sous-total, en centimes. `0` si aucune. */
  readonly discountCents: number;
  /**
   * **Ce qui a produit** `discountCents`, figé à la commande : le taux ou le
   * montant de la remise du point de retrait. Sans lui, une facture ne peut dire
   * que « Remise 70,68 € » — jamais « Retrait au labo −20 % ». Le déduire d'une
   * division mentirait dès qu'il s'agit d'une remise en euros, ou dès qu'un
   * arrondi décale le rapport. `null` = aucune remise (ou commande antérieure au
   * snapshot).
   */
  readonly discountAdjustment: CartAdjustment | null;
  /** Frais de livraison (zone) ajouté, HT, en centimes. `0` si aucun. */
  readonly deliveryFeeCents: number;
  /** TVA totale (marchandises par taux + livraison), en centimes. */
  readonly vatCents: number;
  /** Total **TTC** = `max(0, subtotal − discount) + deliveryFee + vat`. */
  readonly totalCents: number;
  readonly currency: string;
  /** Panier récurrent d'origine (« récurrent »), ou `null` (commande ponctuelle). */
  readonly fromSubscriptionId: string | null;
  /**
   * Par quelle porte cette commande est entrée. Dérivé serveur — cf.
   * {@link OrderOrigin}. Le client le voit aussi, et c'est voulu : « saisie par
   * l'équipe » explique une commande qu'il ne se souvient pas d'avoir passée.
   */
  readonly origin: OrderOrigin;
  /**
   * Le membre de l'équipe qui l'a saisie, ou `null`. Un identifiant d'annuaire
   * et non un instantané du nom : un annuaire corrigé doit corriger l'affichage,
   * pas laisser un ancien nom figé sur la commande.
   */
  readonly placedByStaffId: string | null;
  /** Écarts vs le gabarit récurrent (pills +/−), ou `null` si non issue d'un abonnement. */
  readonly recurringDeltas: RecurringDeltas | null;
  /** ISO. Passée le. */
  readonly placedAt: string;
  readonly lines: readonly OrderLineView[];
  /**
   * Le **jeton de remise** — ce que le QR du client encode, et rien d'autre.
   * Émis à la passation pour les seules commandes en **retrait** ; `null` en
   * coursier (il n'y a pas de comptoir) et sur les commandes antérieures.
   *
   * Il descend jusqu'au client parce que c'est lui qui doit le présenter. Ça n'en
   * fait pas une faille : le jeton n'ouvre qu'une porte **staff**, qui exige une
   * session admin. Le connaître ne permet pas d'attester sa propre remise.
   */
  readonly handoverToken: string | null;
  /** ISO de la remise en main propre, ou `null` — la commande attend encore. */
  readonly handedOverAt: string | null;
}

/**
 * Détails de paiement renvoyés au checkout **quand une carte est requise**
 * (société `per_order`). Le client monte le Payment Element de Stripe avec le
 * `clientSecret` et la `publishableKey` (toutes deux non secrètes), pour le
 * montant `amountCents` (le total ré-résolu serveur). Absent = aucun paiement
 * carte requis (terme différé) : la commande est déjà passée.
 */
export interface OrderPaymentIntent {
  /** Client secret de la PaymentIntent Stripe — à passer au Payment Element. */
  readonly clientSecret: string;
  /** Clé **publique** Stripe (pk_test_… / pk_live_…) — destinée au bundle. */
  readonly publishableKey: string;
  /** Montant à encaisser, en centimes (le total serveur). Pour l'affichage. */
  readonly amountCents: number;
}

/**
 * Réponse de passation : l'identifiant et le numéro humain de la commande, plus —
 * seulement pour les sociétés `per_order` — l'intention de paiement à régler par
 * carte. `payment` absent = commande facturée sur terme, rien à encaisser au
 * checkout.
 */
export interface PlacedOrderResponse {
  readonly id: string;
  readonly orderNumber: string;
  readonly payment?: OrderPaymentIntent;
}

// ─── Surface ADMIN (staff) ───────────────────────────────────────────────────

/**
 * Une commande dans la liste **staff**. Volontairement distincte d'`OrderView` :
 * un commercial parcourt des dizaines de lignes, il lui faut **qui a commandé**
 * — que la vue client n'a aucune raison de porter, le client se connaissant — et
 * pas les lignes d'articles, qu'il ne lit qu'après avoir ouvert.
 */
export interface AdminOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  /** ISO. Passée le. */
  readonly placedAt: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly fulfillmentMethod: FulfillmentMethod;
  /**
   * Sous-total **HT** et **TVA**, en centimes — la décomposition que réclame la
   * comptabilité. Ils vivent déjà sur la commande ; les taire dans la liste
   * obligeait à ouvrir chaque commande pour reporter un mois.
   */
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  /**
   * Qui a commandé, en clair : la raison sociale, ou la personne quand la
   * commande est **zéro friction** (sans entreprise). Résolu au serveur — c'est
   * une jointure, pas une affaire d'écran.
   */
  readonly customerLabel: string;
  /** `null` = commande personnelle, sans entreprise. */
  readonly companyId: string | null;
  /**
   * Par quelle porte elle est entrée — cf. {@link OrderOrigin}. Remplace le
   * booléen `fromSubscription` : deux façons de dire la provenance sur la même
   * ligne finissaient par se contredire dès qu'une troisième porte s'ouvrait,
   * et c'est précisément ce qui vient d'arriver avec la saisie par l'équipe.
   */
  readonly origin: OrderOrigin;
}

/**
 * Filtres de la liste staff. `limit` est **borné** : une liste d'administration
 * sans plafond finit par ramener toute la table le jour où le catalogue marche.
 */
export const adminOrdersQuerySchema = z.object({
  /** Restreint à une entreprise. Absent = toutes, entreprises et personnelles. */
  companyId: z.string().trim().min(1).optional(),
  /** Restreint à un état d'avancement. */
  status: orderStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;
