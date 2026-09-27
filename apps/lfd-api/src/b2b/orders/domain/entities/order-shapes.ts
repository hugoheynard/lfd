import type {
  BillingAddressPayload,
  // Aliasé : `OrderFulfillmentInput` désigne déjà ici le mode + les adresses.
  // Deux « fulfillment » dans le même fichier finiraient par se confondre.
  OrderFulfillment as AgreedFulfillment,
  CartAdjustment,
  FulfillmentMethod,
  LateFeeAdjustment,
  OrderClientele,
  PaymentStatus,
} from "@lfd/contracts";
import type { VatShare } from "@lfd/money";

import type { OrderLineInput, OrderLineSnapshot } from "../value-objects/order-line.js";

// Les formes d'entrée et de sortie de l'agrégat `Order` — sorties de `order.ts`
// pour le garder lisible, réexportées par lui : on les importe d'où l'on veut.

/** Acheminement demandé : coursier (zone + adresse libre) OU retrait (point figé). */
export interface OrderFulfillmentInput {
  readonly method: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
}

/**
 * Le bon de fidélité nommé à la commande, tel que la fidélité l'a lu : son
 * identifiant et sa valeur **hors taxe**. Ce qu'il impute se décide ici.
 */
export interface OrderVoucher {
  readonly id: string;
  readonly valueCents: number;
}

/** Ce qu'il faut pour **composer** une commande (prix/frais déjà résolus serveur). */
export interface DraftOrderInput {
  readonly companyId: string | null;
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
  /** Remise (retrait) déjà résolue, HT, en centimes. */
  readonly discountCents: number;
  /** L'ajustement qui l'a produite (taux ou montant), ou `null` si aucune. */
  readonly discountAdjustment: CartAdjustment | null;
  /** Frais de livraison (zone) déjà résolu, HT, en centimes. */
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
   * Le bon de fidélité, ou `null` (plan des points, lot C). Seulement pour une
   * commande personnelle : l'agrégat refuse un bon sur une commande de société.
   */
  readonly voucher: OrderVoucher | null;
}

/** État de la commande sérialisé pour la persistance — aucun type Prisma ici. */
export interface OrderToPlace {
  readonly companyId: string | null;
  /** Qui commande, déduit par l'agrégat — cf. `clienteleOf` dans `order-fulfillment.ts`. */
  readonly clientele: OrderClientele;
  readonly placedByUserId: string;
  readonly placedByStaffId: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
  /** L'acheminement convenu, figé (cf. {@link DraftOrderInput.agreed}). */
  readonly agreed: AgreedFulfillment;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  readonly catalogVersionId: string | null;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly discountAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: LateFeeAdjustment | null;
  /** La part du bon réellement imputée, HT — `0` sans bon. */
  readonly voucherDiscountCents: number;
  /** Le bon engagé, ou `null`. */
  readonly loyaltyVoucherId: string | null;
  readonly vatCents: number;
  /**
   * La TVA par taux, **figée comme le reste**. C'est ce qui permet au bon de
   * commande de détailler « dont TVA 5,5 % » sans rien recalculer.
   */
  readonly vatShares: readonly VatShare[];
  readonly totalCents: number;
  readonly paymentStatus: PaymentStatus;
  readonly stripePaymentIntentId: string | null;
  readonly lines: readonly OrderLineSnapshot[];
}
