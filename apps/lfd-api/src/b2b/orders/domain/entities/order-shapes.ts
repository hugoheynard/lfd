import type {
  BillingAddressPayload,
  // Aliasé : `OrderFulfillmentInput` désigne déjà ici le mode + les adresses.
  // Deux « fulfillment » dans le même fichier finiraient par se confondre.
  OrderFulfillment as AgreedFulfillment,
  CartAdjustment,
  DeliveryVatMode,
  FulfillmentMethod,
  PickupSnapshot,
  LateFeeAdjustment,
  ContentLocale,
  OrderClientele,
  PaymentStatus,
  SalesTermsDocument,
} from "@lfd/contracts";
import type { VatShare } from "@lfd/money";

import type { FixedCustomerCancellation } from "../services/customer-cancellation-window.js";
import type { OrderLineInput, OrderLineSnapshot } from "../value-objects/order-line.js";
import type { OrderLocale } from "../value-objects/order-locale.js";
import type { OrderRateAmounts } from "../value-objects/order-rate-amounts.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";

// Les formes d'entrée et de sortie de l'agrégat `Order` — sorties de `order.ts`
// pour le garder lisible, réexportées par lui : on les importe d'où l'on veut.

/** Acheminement demandé : coursier (zone + adresse libre) OU retrait (point figé). */
export interface OrderFulfillmentInput {
  readonly method: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  /**
   * L'adresse du CARNET dont vient `deliveryAddress`, ou `null` si elle a été
   * dictée à la volée. Le snapshot reste ce qui est livré ; le lien sert à
   * relire ce que l'adresse dit AUJOURD'HUI — consignes, procédure, GPS —
   * sur la feuille de route (`plan-preparation-de-tournee.md`, lot 1).
   *
   * L'appelant ne la passe qu'après l'avoir lue sous le mur de la société
   * (`DeliveryDefaults.bookAddressId`) ; l'agrégat refuse, lui, un lien sans
   * société ou hors coursier.
   */
  readonly deliveryAddressId: string | null;
  /** Le point figé, avec le site qui remet (`siteId`, lot S2) quand il est connu. */
  readonly pickupAddress: PickupSnapshot | null;
}

/**
 * Le bon de fidélité nommé à la commande, tel que la fidélité l'a lu : son
 * identifiant et sa **valeur faciale** — HT pour une commande `line_ht`, TTC
 * pour une commande `exact_ht` (plan du centime, § 10 Q2). Ce qu'il impute se
 * décide ici.
 */
export interface OrderVoucher {
  readonly id: string;
  readonly valueCents: number;
}

/**
 * Le principal de la société qui commande, **copié à la passation**
 * (`plan-notifications-sous-comptes.md`, §2, Q1) : qui prévenir, et s'il voit
 * le montant. Un suivi ouvert ou fermé ensuite ne change rien à la commande.
 */
export interface OrderPrincipal {
  readonly companyId: string;
  /** Le site suivait `billing` ou `pricing` à la passation. */
  readonly seesAmount: boolean;
}

/** Ce qu'il faut pour **composer** une commande (prix/frais déjà résolus serveur). */
export interface DraftOrderInput {
  readonly companyId: string | null;
  /**
   * Le PAYEUR résolu à la passation (`orderPayerOf`, `sous-comptes.md`
   * §2.3) : le principal d'un site qui suit `billing`, sinon la société.
   * `null` sans société — l'agrégat refuse un payeur sans elle.
   */
  readonly billedCompanyId: string | null;
  /** Le principal copié (`orderPrincipalOf`), ou `null` : pas de principal, ou pas de société. */
  readonly principal: OrderPrincipal | null;
  /** Au nom de qui — toujours un client, même quand l'équipe saisit pour lui. */
  readonly placedByUserId: string;
  /** Qui l'a saisie chez LFC, ou `null` quand le client a commandé seul. */
  readonly placedByStaffId: string | null;
  readonly fulfillment: OrderFulfillmentInput;
  /**
   * L'acheminement **convenu** — tranche, contact, signature — déjà figé avec sa
   * provenance. L'agrégat ne le recalcule pas : c'est une décision prise à la
   * frontière (le réglage du client y entre), pas un invariant de la commande.
   * Il le porte et le rend, pour qu'aucune relecture ultérieure n'aille
   * réinterroger un réglage qui aura bougé.
   */
  readonly agreed: AgreedFulfillment;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  /**
   * La **version du catalogue** sous laquelle ces lignes ont été résolues, ou
   * `null` si aucune n'a encore été posée.
   *
   * Répond à « d'où venaient ces articles », jamais à « quel prix » : le prix,
   * la TVA, le nom et la trace de résolution sont figés sur la ligne. `null` est
   * une réponse honnête — « on ne sait pas » —, pas un défaut à combler.
   */
  readonly catalogVersionId: string | null;
  readonly lines: readonly OrderLineInput[];
  /**
   * Remise (retrait) déjà résolue, en centimes, **dans l'unité de la méthode**
   * de la commande : HT pour `line_ht`, TTC pour `exact_ht` (plan du centime,
   * § 5) — l'agrégat rejoue l'ajustement dans cette unité et compare.
   */
  readonly discountCents: number;
  /** L'ajustement qui l'a produite (taux ou montant), ou `null` si aucune. */
  readonly discountAdjustment: CartAdjustment | null;
  /** Frais de livraison (zone) déjà résolus, dans l'unité de la méthode (cf. `discountCents`). */
  readonly deliveryFeeCents: number;
  /** Le barème de zone qui l'a produit, ou `null` en retrait. */
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  /**
   * **La surtaxe de commande tardive**, quand une dérogation a laissé passer.
   *
   * `0` = aucune, et c'est le cas de l'immense majorité des commandes. Elle
   * s'ajoute au panier comme les frais de zone et ne touche à AUCUN prix
   * d'article : les étages tarifaires répondent à ce qu'un article vaut, la
   * surtaxe à comment la commande a été passée.
   */
  readonly lateFeeCents: number;
  /** L'ajustement ET le taux qui l'ont produite, figés. `null` si aucune. */
  readonly lateFeeAdjustment: LateFeeAdjustment | null;
  /**
   * Le mode de TVA du port, lu au réglage par l'appelant (plan
   * `architecture-tva-des-frais-de-port.md`, V3). L'agrégat le passe au calcul et le
   * fige. Une révision recalcule la TVA mais reprend ce mode-ci, figé à la
   * passation (`OrderRevising`, plan de modification, M1, 2026-10-23) : la
   * commande garde le mode de sa passation.
   */
  readonly deliveryVatMode: DeliveryVatMode;
  /**
   * Le bon de fidélité, ou `null` (plan des points, lot C). Seulement pour une
   * commande personnelle : l'agrégat refuse un bon sur une commande de société.
   */
  readonly voucher: OrderVoucher | null;
  /**
   * Les CGV en vigueur pour l'audience qui a tarifé la commande, lues par
   * l'appelant (plan `legal/plan-cgv-par-audience.md`, C4′). L'agrégat les
   * fige : une révision écrite demain ne réécrit pas ce que la commande portait.
   */
  readonly salesTerms: OrderSalesTerms;
  /**
   * La langue de la boutique quand le CLIENT a commandé (lot A3), ou `null` :
   * saisie du staff, ou boutique qui ne l'a pas envoyée. Jamais devinée.
   */
  readonly locale: OrderLocale | null;
}

/** État de la commande sérialisé pour la persistance — aucun type Prisma ici. */
export interface OrderToPlace {
  readonly companyId: string | null;
  /** Le payeur copié (cf. {@link DraftOrderInput.billedCompanyId}). */
  readonly billedCompanyId: string | null;
  /** Le principal copié (cf. {@link DraftOrderInput.principal}), `null` sans principal. */
  readonly principalCompanyId: string | null;
  /** `null` sans principal ; sinon s'il voit le montant (Q1). */
  readonly principalSeesAmount: boolean | null;
  /** Qui commande, déduit par l'agrégat — cf. `clienteleOf` dans `order-fulfillment.ts`. */
  readonly clientele: OrderClientele;
  readonly placedByUserId: string;
  /** Reçue par l'équipe sur un plan déjà arrêté (lot O3) — cf. `Order.receiveOffPlan`. */
  readonly placedOffPlan: boolean;
  /** Le délai d'annulation figé à la passation, reporté par une révision (2026-10-26). */
  readonly customerCancellation: FixedCustomerCancellation;
  /**
   * Jusqu'à quand le particulier annule, déduit du délai figé ; `null` :
   * non figé, figé sans délai, ou commande sans date.
   */
  readonly customerCancellableUntil: Date | null;
  readonly placedByStaffId: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Le lien vers le carnet (cf. {@link OrderFulfillmentInput.deliveryAddressId}). */
  readonly deliveryAddressId: string | null;
  readonly pickupAddress: PickupSnapshot | null;
  /** L'acheminement convenu, figé (cf. {@link DraftOrderInput.agreed}). */
  readonly agreed: AgreedFulfillment;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  readonly catalogVersionId: string | null;
  /** Comment les montants ont été composés — décidé à la passation, relu ensuite. */
  readonly vatMethod: OrderVatMethod;
  /** HT, comme `discountCents`, `deliveryFeeCents` et `voucherDiscountCents`. */
  readonly subtotalCents: number;
  readonly discountCents: number;
  /** Les TTC des termes d'une commande `exact_ht`, `null` pour `line_ht` (CHECK). */
  readonly discountTtcCents: number | null;
  readonly discountAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
  readonly deliveryFeeTtcCents: number | null;
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: LateFeeAdjustment | null;
  /** Le mode de TVA du port, figé (cf. {@link DraftOrderInput.deliveryVatMode}). */
  readonly deliveryVatMode: DeliveryVatMode;
  /** La part du bon réellement imputée, HT — `0` sans bon. */
  readonly voucherDiscountCents: number;
  /** La valeur faciale TTC imputée d'une commande `exact_ht`, `null` pour `line_ht`. */
  readonly voucherTtcCents: number | null;
  /** Le bon engagé, ou `null`. */
  readonly loyaltyVoucherId: string | null;
  readonly vatCents: number;
  /**
   * La TVA par taux, **figée comme le reste**. C'est ce qui permet au bon de
   * commande de détailler « dont TVA 5,5 % » sans rien recalculer.
   */
  readonly vatShares: readonly VatShare[];
  /** La part de chaque taux d'une commande `exact_ht`, `null` pour `line_ht`. */
  readonly ttcByRate: readonly OrderRateAmounts[] | null;
  readonly totalCents: number;
  readonly paymentStatus: PaymentStatus;
  readonly stripePaymentIntentId: string | null;
  /** Les CGV figées (cf. {@link DraftOrderInput.salesTerms}). */
  readonly salesTerms: OrderSalesTerms;
  /** La langue de la passation (cf. {@link DraftOrderInput.locale}). */
  readonly locale: ContentLocale | null;
  readonly lines: readonly OrderLineSnapshot[];
}

/**
 * **Les CGV qu'une commande porte** (C4) : le texte, sa révision et le PDF en
 * vigueur. `revision` et `fileId` sont `null` quand rien n'existait — des CGV
 * pro pas encore rédigées : le fait est enregistré tel quel.
 */
export interface OrderSalesTerms {
  readonly document: SalesTermsDocument;
  readonly revision: number | null;
  readonly fileId: string | null;
}
