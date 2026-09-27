import {
  type BillingAddressPayload,
  // Aliasé : `OrderFulfillmentInput` désigne déjà ici le mode + les adresses.
  // Deux « fulfillment » dans le même fichier finiraient par se confondre.
  type OrderFulfillment as AgreedFulfillment,
  type CartAdjustment,
  type FulfillmentMethod,
  type LateFeeAdjustment,
  type OrderClientele,
  type PaymentStatus,
} from "@lfd/contracts";

import {
  EmptyOrderError,
  InvalidOrderFulfillmentError,
  InvalidOrderPaymentError,
} from "../errors/order-errors.js";
import type { VatShare } from "@lfd/money";

import {
  ensureDeliveryFeeMatches,
  ensureDiscountMatches,
  ensureLateFeeMatches,
  voucherDiscountOf,
} from "./order-amount-guards.js";
import { computeOrderTotals } from "../services/vat.js";
import {
  OrderLine,
  type OrderLineInput,
  type OrderLineSnapshot,
} from "../value-objects/order-line.js";

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
  /** Qui commande, déduit par l'agrégat — cf. {@link clienteleOf}. */
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

/** Décision de règlement : indécise (`null`), carte (intent), ou différée. */
type Payment = { readonly status: PaymentStatus; readonly intentId: string | null } | null;

/**
 * **Commande** (agrégat racine). Elle possède son **argent** : sous-total, TVA
 * (via le moteur `vat`) et total TTC sont calculés ici, pas dans le handler. La
 * passation est un cycle : `draft()` fige lignes + acheminement et calcule les
 * montants ; puis on décide le règlement — `payByCard(intent)` (total > 0) ou
 * `deferPayment()`. `toPersistence()` refuse une commande dont le règlement n'est
 * pas décidé (pas de commande fantôme).
 */
export class Order {
  private payment: Payment = null;

  private constructor(
    private readonly companyId: string | null,
    private readonly placedByUserId: string,
    private readonly placedByStaffId: string | null,
    private readonly fulfillment: OrderFulfillmentInput,
    private readonly agreed: AgreedFulfillment,
    private readonly requestedDeliveryDate: Date | null,
    private readonly note: string,
    private readonly catalogVersionId: string | null,
    private readonly lines: readonly OrderLine[],
    private readonly discountCents: number,
    private readonly discountAdjustment: CartAdjustment | null,
    private readonly deliveryFeeCents: number,
    private readonly deliveryFeeAdjustment: CartAdjustment | null,
    private readonly lateFeeCents: number,
    private readonly lateFeeAdjustment: LateFeeAdjustment | null,
    private readonly voucher: { readonly id: string; readonly appliedCents: number } | null,
    private readonly subtotalCentsValue: number,
    private readonly vatCentsValue: number,
    private readonly vatSharesValue: readonly VatShare[],
    private readonly totalCentsValue: number,
  ) {}

  /** Compose une commande : valide, fige les lignes et calcule tous les montants. */
  static draft(input: DraftOrderInput): Order {
    if (input.lines.length === 0) {
      throw new EmptyOrderError();
    }
    if (input.discountCents < 0 || input.deliveryFeeCents < 0 || input.lateFeeCents < 0) {
      throw new InvalidOrderPaymentError("Remise, frais et surtaxe doivent être positifs.");
    }
    const fulfillment = normalizeFulfillment(input.fulfillment);
    // 🔴 **L'audience est décidée UNE fois, ici** — le seul endroit qui la
    // connaisse au moment où elle est encore vraie. Chaque ligne scelle alors
    // son taxe compris, ou ne le scelle pas ; le document, plus tard, n'a plus
    // qu'à regarder ce qu'il a (R3, 2026-09-21).
    const clientele = clienteleOf(input.companyId);
    const lines = input.lines.map((line) => OrderLine.create(line, clientele));
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    ensureDiscountMatches(input, subtotalCents);
    ensureLateFeeMatches(input, subtotalCents);
    ensureDeliveryFeeMatches(input, subtotalCents);
    const voucherDiscountCents = voucherDiscountOf(
      input.voucher,
      input.companyId,
      subtotalCents - input.discountCents,
    );
    // 🔴 **Une seule définition du TTC**, et elle est dans la ventilation.
    //
    // Le total se recomposait ici — `max(0, sous-total − remise) + frais +
    // surtaxe + TVA` — pendant que la TVA venait de `ventilateVat`. Les deux
    // tombaient juste, et c'est ce qui rendait la chose dangereuse : un terme
    // ajouté au panier n'entre dans la TVA et dans le total qu'en deux gestes,
    // dont un seul est évident.
    //
    // La règle que ce commentaire portait — la surtaxe s'ajoute APRÈS la remise,
    // comme les frais de zone, parce qu'on ne fait pas de geste commercial sur
    // une pénalité de retard — n'est pas perdue : elle est APPLIQUÉE dans
    // `ventilateVat`, où les extras sont proratisés sur le sous-total brut
    // quand les lignes le sont sur le net. Elle est passée de commentaire à
    // code exécuté.
    const { vatCents, vatShares, totalCents } = computeOrderTotals({
      lines: lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: line.vatRate })),
      discountCents: input.discountCents,
      voucherDiscountCents,
      deliveryFeeCents: input.deliveryFeeCents,
      lateFeeCents: input.lateFeeCents,
      lateFeeVatRate: input.lateFeeAdjustment?.vatRatePercent ?? null,
    });
    return new Order(
      input.companyId,
      input.placedByUserId,
      input.placedByStaffId,
      fulfillment,
      input.agreed,
      input.requestedDeliveryDate,
      input.note,
      input.catalogVersionId,
      lines,
      input.discountCents,
      input.discountAdjustment,
      input.deliveryFeeCents,
      input.deliveryFeeAdjustment,
      input.lateFeeCents,
      input.lateFeeAdjustment,
      input.voucher === null ? null : { id: input.voucher.id, appliedCents: voucherDiscountCents },
      subtotalCents,
      vatCents,
      vatShares,
      totalCents,
    );
  }

  /** Total **TTC** à encaisser — la source pour dimensionner l'intention Stripe. */
  get totalCents(): number {
    return this.totalCentsValue;
  }

  /** La part du bon réellement imputée, HT — `0` sans bon. Ce que le reliquat retranche. */
  get voucherDiscountCents(): number {
    return this.voucher?.appliedCents ?? 0;
  }

  /** Règlement **carte** : rattache l'intention Stripe. Refuse un total nul. */
  payByCard(paymentIntentId: string): void {
    if (this.totalCentsValue <= 0) {
      throw new InvalidOrderPaymentError("Une carte ne peut régler un total nul.");
    }
    this.payment = { status: "pending", intentId: paymentIntentId };
  }

  /** Règlement **différé** (terme d'entreprise) ou gratuit : rien à encaisser. */
  deferPayment(): void {
    this.payment = { status: "not_required", intentId: null };
  }

  /** Sérialise pour l'adaptateur — refuse une commande au règlement non décidé. */
  toPersistence(): OrderToPlace {
    if (this.payment === null) {
      throw new InvalidOrderPaymentError("Le règlement de la commande n'est pas décidé.");
    }
    return {
      companyId: this.companyId,
      clientele: clienteleOf(this.companyId),
      placedByUserId: this.placedByUserId,
      placedByStaffId: this.placedByStaffId,
      fulfillmentMethod: this.fulfillment.method,
      deliveryZoneId: this.fulfillment.deliveryZoneId,
      deliveryAddress: this.fulfillment.deliveryAddress,
      pickupAddress: this.fulfillment.pickupAddress,
      agreed: this.agreed,
      requestedDeliveryDate: this.requestedDeliveryDate,
      note: this.note,
      catalogVersionId: this.catalogVersionId,
      subtotalCents: this.subtotalCentsValue,
      discountCents: this.discountCents,
      discountAdjustment: this.discountAdjustment,
      deliveryFeeCents: this.deliveryFeeCents,
      deliveryFeeAdjustment: this.deliveryFeeAdjustment,
      lateFeeCents: this.lateFeeCents,
      lateFeeAdjustment: this.lateFeeAdjustment,
      voucherDiscountCents: this.voucherDiscountCents,
      loyaltyVoucherId: this.voucher?.id ?? null,
      vatCents: this.vatCentsValue,
      vatShares: this.vatSharesValue,
      totalCents: this.totalCentsValue,
      paymentStatus: this.payment.status,
      stripePaymentIntentId: this.payment.intentId,
      lines: this.lines.map((line) => line.toSnapshot()),
    };
  }
}

/**
 * **Qui commande** : `pro` quand la commande est passée pour une société,
 * `public` sinon — quel que soit le statut de la société.
 *
 * C'est QUI commande, pas le tarif : une société en attente est `pro` ici et
 * B2C au tarif (plan `documentation/order/plan-nature-du-client-sur-la-commande.md`,
 * D1 et D2). Aucun appelant ne la passe, pour qu'aucun ne puisse la contredire.
 *
 * ⚠️ Règle **appliquée par l'agrégat**, pas une impossibilité : la base ne la
 * contraint pas, et une société supprimée remet `company_id` à nul sous une
 * commande restée `pro` (D3).
 */
function clienteleOf(companyId: string | null): OrderClientele {
  return companyId === null ? "public" : "pro";
}

/**
 * Coursier ⇒ zone + adresse requises, pas de point ; retrait ⇒ point requis, pas
 * de zone ni d'adresse. Coupe le résidu pour ne rien figer d'incohérent.
 */
function normalizeFulfillment(fulfillment: OrderFulfillmentInput): OrderFulfillmentInput {
  if (fulfillment.method === "delivery") {
    if (fulfillment.deliveryZoneId === null || fulfillment.deliveryAddress === null) {
      throw new InvalidOrderFulfillmentError("Un coursier exige une zone et une adresse.");
    }
    return {
      method: "delivery",
      deliveryZoneId: fulfillment.deliveryZoneId,
      deliveryAddress: fulfillment.deliveryAddress,
      pickupAddress: null,
    };
  }
  if (fulfillment.pickupAddress === null) {
    throw new InvalidOrderFulfillmentError("Un retrait exige un point de retrait.");
  }
  return {
    method: fulfillment.method,
    deliveryZoneId: null,
    deliveryAddress: null,
    pickupAddress: fulfillment.pickupAddress,
  };
}
