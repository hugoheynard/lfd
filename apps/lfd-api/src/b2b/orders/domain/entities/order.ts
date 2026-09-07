import {
  cartAdjustmentCents,
  discountCentsOf,
  type BillingAddressPayload,
  // Aliasé : `OrderFulfillmentInput` désigne déjà ici le mode + les adresses.
  // Deux « fulfillment » dans le même fichier finiraient par se confondre.
  type OrderFulfillment as AgreedFulfillment,
  type CartAdjustment,
  type FulfillmentMethod,
  type LateFeeAdjustment,
  type PaymentStatus,
} from "@lfd/contracts";

import {
  EmptyOrderError,
  InvalidOrderFulfillmentError,
  InvalidOrderPaymentError,
} from "../errors/order-errors.js";
import type { VatShare } from "@lfd/money";

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
}

/** État de la commande sérialisé pour la persistance — aucun type Prisma ici. */
export interface OrderToPlace {
  readonly companyId: string | null;
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
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: LateFeeAdjustment | null;
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

/**
 * La surtaxe correspond-elle à l'ajustement qui la prétend ?
 *
 * Même garde que pour la remise, et pour la même raison : les deux nombres
 * arrivent séparément de l'appelant, et rien d'autre ne les relie. Un montant
 * qui ne découle pas de son ajustement rendrait la trace figée mensongère —
 * c'est-à-dire pire qu'absente.
 */
function ensureLateFeeMatches(input: DraftOrderInput, subtotalCents: number): void {
  const frozen = input.lateFeeAdjustment;
  if (frozen === null) {
    if (input.lateFeeCents !== 0) {
      throw new InvalidOrderPaymentError("Surtaxe sans ajustement qui la justifie.");
    }
    return;
  }
  if (cartAdjustmentCents(frozen.adjustment, subtotalCents) !== input.lateFeeCents) {
    throw new InvalidOrderPaymentError("La surtaxe ne correspond pas à son ajustement.");
  }
}

/**
 * L'ajustement figé doit **reproduire** le montant retenu. Sans ce contrôle, une
 * commande pourrait porter « −20 % » à côté d'une remise de 12 € : le libellé et
 * le chiffre se contrediraient sur la facture, et rien ne dirait lequel ment.
 *
 * 🔴 Il compare du **borné** à du borné (`discountCentsOf`), là où il comparait
 * du brut. Une remise en montant fixe supérieure au panier — 50 € sur 10 € —
 * passait donc telle quelle et s'enregistrait à 50 € à côté d'un sous-total de
 * 10 € : la ligne ne s'additionnait pas, et elle contredisait le devis, que
 * `ventilateVat` bornait déjà de son côté. La borne est désormais posée à la
 * source, dans `CartAdjustments` ; celle-ci est la barrière de l'agrégat, qui
 * ne fait confiance à aucun appelant.
 *
 * @throws {InvalidOrderPaymentError} le libellé ne correspond pas au montant.
 */
function ensureDiscountMatches(input: DraftOrderInput, subtotalCents: number): void {
  if (input.discountAdjustment === null) {
    return;
  }
  if (discountCentsOf(input.discountAdjustment, subtotalCents) !== input.discountCents) {
    throw new InvalidOrderPaymentError(
      "La remise retenue ne correspond pas à l'ajustement appliqué.",
    );
  }
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
    private readonly lateFeeCents: number,
    private readonly lateFeeAdjustment: LateFeeAdjustment | null,
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
    const lines = input.lines.map((line) => OrderLine.create(line));
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    ensureDiscountMatches(input, subtotalCents);
    ensureLateFeeMatches(input, subtotalCents);
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
      input.lateFeeCents,
      input.lateFeeAdjustment,
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
      lateFeeCents: this.lateFeeCents,
      lateFeeAdjustment: this.lateFeeAdjustment,
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
