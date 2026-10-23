import {
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type CartAdjustment,
  cartAdjustmentSchema,
  type DeliveryVatMode,
  deliveryVatModeSchema,
  type FulfillmentMethod,
  type LateFeeAdjustment,
  lateFeeAdjustmentSchema,
  type OrderLineView,
  type OrderStatus,
  type OrderView,
  type OrderRefundStatus,
  refundedCentsOf,
  type PaymentStatus,
  type SheetCustomer,
  type AtelierSheet,
  type RecurringDeltas,
  recurringDeltasSchema,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  PaymentStatus as PaymentStatusValue,
  type Prisma,
} from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { contactOf, pickupLabelOf, type HolderSide } from "./atelier-sheet-parts.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";
import { parseAllergens, parseTrace, type OrderLineRow } from "./order-line-row.js";
import { settlementWhere } from "./plan-filter.js";
import {
  OrderReader,
  type OrderAuthor,
  type OwnedOrder,
  type PackingOrder,
} from "../domain/ports/order.reader.js";
import { companyDisplayName, vatSharesSchema, type VatShareView } from "@lfd/contracts";

import { orderOriginOf } from "../domain/services/order-origin.js";
import { pickupDiscountBaseOf } from "../domain/services/pickup-discount-base.js";
import { settlementRegimeOf } from "../domain/services/settlement-regime.js";

/** Une commande telle que Prisma la sélectionne. */
export interface OrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly requestedDeliveryDate: Date | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddressId: string | null;
  readonly deliveryAddressSnapshot: Prisma.JsonValue | null;
  readonly pickupAddress: Prisma.JsonValue | null;
  readonly fulfillment: Prisma.JsonValue | null;
  readonly note: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly discountAdjustment: Prisma.JsonValue | null;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeAdjustment: Prisma.JsonValue | null;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: Prisma.JsonValue | null;
  readonly deliveryVatMode: string | null;
  readonly vatCents: number;
  readonly vatShares: Prisma.JsonValue | null;
  readonly totalCents: number;
  readonly currency: string;
  readonly companyId: string | null;
  readonly company: { readonly raisonSociale: string } | null;
  readonly placedBy: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
  };
  readonly fromSubscriptionId: string | null;
  readonly placedByStaffId: string | null;
  readonly recurringDeltas: Prisma.JsonValue | null;
  readonly handoverToken: string | null;
  readonly confirmedAt: Date | null;
  readonly readyAt: Date | null;
  readonly handedOverAt: Date | null;
  readonly createdAt: Date;
  readonly lines: readonly OrderLineRow[];
  readonly refunds: readonly {
    readonly amountCents: number;
    readonly status: OrderRefundStatus;
    readonly refundedAt: Date;
  }[];
}

/** Colonnes d'une commande à lire (partagées entreprise / personnel). */
export const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  requestedDeliveryDate: true,
  fulfillmentMethod: true,
  deliveryAddressId: true,
  deliveryAddressSnapshot: true,
  pickupAddress: true,
  fulfillment: true,
  note: true,
  subtotalCents: true,
  discountCents: true,
  discountAdjustment: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  deliveryFeeAdjustment: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
  deliveryVatMode: true,
  vatCents: true,
  vatShares: true,
  totalCents: true,
  currency: true,
  // De quoi NOMMER le client : le bon de commande le porte depuis le
  // 2026-09-07, et une feuille sans destinataire ne se classe pas.
  company: { select: { raisonSociale: true } },
  placedBy: { select: { firstName: true, lastName: true, email: true } },
  companyId: true,
  fromSubscriptionId: true,
  placedByStaffId: true,
  recurringDeltas: true,
  handoverToken: true,
  confirmedAt: true,
  readyAt: true,
  handedOverAt: true,
  createdAt: true,
  lines: {
    select: {
      sku: true,
      productNameSnapshot: true,
      unitPriceMillicents: true,
      vatRate: true,
      quantity: true,
      lineTotalCents: true,
      unitPriceTtcCents: true,
      lineTotalTtcCents: true,
      basePriceMillicents: true,
      pricingSteps: true,
      pricingFloored: true,
      pricingClampedToZero: true,
      pricingFloor: true,
      pricingCommitment: true,
      pricingRejected: true,
      allergens: true,
      pickupDiscountEligible: true,
    },
  },
  // Les remboursements Stripe constatés (lot R1), dans l'ordre du constat.
  refunds: {
    select: { amountCents: true, status: true, refundedAt: true },
    orderBy: { recordedAt: "asc" },
  },
} as const;

/**
 * **Ce que le client voit de ses commandes** (plan
 * `documentation/commandes/commande-carte-reglee.md`, §2.1, §4.3) : une
 * commande annulée sans avoir été payée n'en est pas une. Seule la carte
 * connaît `pending` et `failed` (`settlement-regime.ts`) : la condition ne
 * retire donc ni une commande au compte, ni une gratuite, ni une remboursée.
 *
 * 🔴 **Resserré le 2026-10-09** (Hugo : « je ne veux plus voir une commande non
 * réglée dans le suivi ou la table ») : une commande carte non réglée n'apparaît
 * plus du tout, même encore `placed`. Elle se règle depuis la page de règlement
 * où mène la passation ; le panier, gardé jusqu'au paiement, permet de la
 * repasser, et la nouvelle remplace l'ancienne (`replace-unsettled-shop-orders`).
 */
export const CUSTOMER_VISIBLE = {
  paymentStatus: { notIn: [PaymentStatusValue.pending, PaymentStatusValue.failed] },
} satisfies Prisma.OrderWhereInput;

/** Lecture des commandes (entreprise ou personnel), la plus récente en tête. */
@Injectable()
export class PrismaOrderReader extends OrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listPersonal(userId: string): Promise<readonly OrderView[]> {
    const rows = await this.prisma.order.findMany({
      // Personnel = passée par ce client ET sans entreprise (le mur).
      where: { placedByUserId: userId, companyId: null, ...CUSTOMER_VISIBLE },
      orderBy: { createdAt: "desc" },
      select: ORDER_SELECT,
    });
    return rows.map((row) => toOrderView(row));
  }

  async findById(orderId: string): Promise<OwnedOrder | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        ...ORDER_SELECT,
        companyId: true,
        placedByUserId: true,
        stripePaymentIntentId: true,
        clientele: true,
        loyaltyVoucherId: true,
        revision: true,
        revisedAt: true,
        billedCompanyId: true,
        billedCompany: { select: { raisonSociale: true } },
        // Élargit la sélection commune : le bon nomme le site par son enseigne.
        company: { select: { raisonSociale: true, enseigne: true } },
        // Élargit aussi l'acheteur : le bon public imprime son téléphone.
        placedBy: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      view: toOrderView(row),
      companyId: row.companyId,
      placedByUserId: row.placedByUserId,
      stripePaymentIntentId: row.stripePaymentIntentId,
      clientele: row.clientele,
      loyaltyVoucherId: row.loyaltyVoucherId,
      billedCustomer: billedCustomerOf(row),
      buyerPhone: row.placedBy.phone.trim() === "" ? null : row.placedBy.phone,
      revision: { revision: row.revision, revisedAt: row.revisedAt?.toISOString() ?? null },
    };
  }

  async findAuthorByReference(reference: string): Promise<OrderAuthor | null> {
    const row = await this.prisma.order.findUnique({
      where: { orderNumber: reference },
      select: { id: true, orderNumber: true, placedByUserId: true },
    });
    return row === null
      ? null
      : { orderId: row.id, orderNumber: row.orderNumber, placedByUserId: row.placedByUserId };
  }

  async findForPacking(reference: string): Promise<PackingOrder | null> {
    const row = await this.prisma.order.findUnique({
      where: { orderNumber: reference },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        requestedDeliveryDate: true,
        readyAt: true,
        readyBy: true,
        companyId: true,
        placedByUserId: true,
        company: { select: { raisonSociale: true } },
        placedBy: { select: { email: true, firstName: true, lastName: true } },
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      orderId: row.id,
      orderNumber: row.orderNumber,
      placedByUserId: row.placedByUserId,
      customerLabel: customerLabelOf(row),
      requestedDeliveryDate: row.requestedDeliveryDate,
      status: row.status,
      readyAt: row.readyAt,
      readyBy: row.readyBy,
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    };
  }

  /**
   * Le lot d'une journée. La colonne est `@db.Date` : **égalité stricte** sur le
   * jour, pas d'intervalle à composer, et l'index posé sur elle sert.
   */
  async listForProduction(date: string): Promise<readonly AtelierSheet[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        requestedDeliveryDate: new Date(`${date}T00:00:00.000Z`),
        // 🔴 **La CINQUIÈME surface de production** (2026-09-17). Les quatre
        // autres lisaient `planWhere` ; celle-ci écartait les seules annulées et
        // imprimait donc des bons que le compte à produire avait refusés.
        //
        // Son statut reste le sien — `settlementWhere` et non `planWhere` — et
        // c'est délibéré : une commande déjà prête ou déjà remise RESTE dans son
        // lot, sans quoi la pile maigrirait entre deux tirages et la numérotation
        // « fiche 3/14 » cesserait de désigner la même feuille.
        status: { notIn: ["cancelled", "draft"] },
        // Un brouillon n'existe pas encore : la file du comptoir l'écarte déjà
        // (« n'affiche PAS un brouillon — il n'attend personne »), le fournil
        // n'a pas de raison d'en fabriquer le contenu.
        ...settlementWhere(),
      },
      orderBy: { orderNumber: "asc" },
      select: {
        id: true,
        orderNumber: true,
        // `created_at` EST la date de passation — le schéma le dit en commentaire
        // sur la colonne. Il n'existe pas de `placed_at`.
        createdAt: true,
        // La révision du bon (plan de modification, M1) : son numéro et son instant.
        revision: true,
        revisedAt: true,
        fulfillmentMethod: true,
        pickupAddress: true,
        deliveryAddressSnapshot: true,
        note: true,
        fromSubscriptionId: true,
        placedByStaffId: true,
        // L'acheminement CONVENU, figé à la passation. C'est lui qui dit le
        // contact, l'heure et la signature — plus le carnet d'adresses, dont la
        // lecture faisait changer un bon déjà imprimé quand un réglage bougeait.
        fulfillment: true,
        company: {
          select: {
            raisonSociale: true,
            enseigne: true,
            // Le détenteur : le repli quand rien n'a été convenu. Une seule
            // ligne attendue — un compte a au plus un `owner`.
            memberships: {
              where: { role: "owner" },
              take: 1,
              select: { user: { select: { firstName: true, lastName: true, phone: true } } },
            },
          },
        },
        placedBy: { select: { email: true, firstName: true, lastName: true } },
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
      },
    });
    return rows.map((row) => this.toSheet(row, date));
  }

  /** Une ligne de commande → une fiche. Extrait pour tenir la limite de lignes. */
  /**
   * Une commande → **le bon de commande d'audience `atelier`**.
   *
   * C'est le seul endroit qui sait composer cette feuille en entier : la
   * projection pure (`atelierSheetOf`) travaille sur une `OrderView`, qui ne
   * porte ni le nom du client, ni le point de retrait nommé, ni le détenteur du
   * compte sur lequel le contact se replie. Trois choses que le fournil lit en
   * premier — d'où la composition ici, avec les jointures sous la main.
   */
  private toSheet(row: ProductionRow, date: string): AtelierSheet {
    const agreed = fulfillmentOf(row.fulfillment);
    return {
      orderId: row.id,
      reference: row.orderNumber,
      audience: "atelier",
      customer: {
        tradeName: row.company?.enseigne ?? "",
        legalName: customerLabelOf(row),
      },
      placedAt: row.createdAt.toISOString(),
      requestedFor: date,
      fulfillment: {
        method: row.fulfillmentMethod,
        address:
          row.fulfillmentMethod === "delivery"
            ? parseAddress(row.deliveryAddressSnapshot)
            : parseAddress(row.pickupAddress),
        pickupLabel: pickupLabelOf(parseAddress(row.pickupAddress)),
        window: agreed.window.value,
        contact: contactOf(agreed, row.company),
        signatureRequired: agreed.signatureRequired.value,
      },
      note: row.note,
      origin: orderOriginOf(row),
      // L'instant de la RÉVISION, pas du tirage : deux impressions de la même
      // journée doivent porter la même date, sinon deux piles du même jour
      // paraissent dire deux choses.
      issuedAt: (row.revisedAt ?? row.createdAt).toISOString(),
      revision: row.revision,
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    };
  }
}

/** Ce que Prisma rend pour une fiche de production. */
interface ProductionRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly createdAt: Date;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly pickupAddress: Prisma.JsonValue | null;
  readonly deliveryAddressSnapshot: Prisma.JsonValue | null;
  readonly note: string;
  readonly fromSubscriptionId: string | null;
  readonly placedByStaffId: string | null;
  readonly revision: number;
  readonly revisedAt: Date | null;
  readonly fulfillment: Prisma.JsonValue | null;
  readonly company:
    (HolderSide & { readonly raisonSociale: string; readonly enseigne: string }) | null;
  readonly placedBy: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
  };
  readonly lines: readonly {
    readonly sku: string;
    readonly productNameSnapshot: string;
    readonly quantity: number;
  }[];
}

/** Les deux jointures qui suffisent à nommer un client — rien de plus. */
interface NameableRow {
  readonly company: { readonly raisonSociale: string } | null;
  readonly placedBy: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
  };
}

/**
 * Le client du bon quand un AUTRE a réglé (sous-comptes §2.3) : le nom du
 * site en tête, la raison sociale du payeur copié en mention légale.
 */
function billedCustomerOf(row: {
  readonly companyId: string | null;
  readonly billedCompanyId: string | null;
  readonly billedCompany: { readonly raisonSociale: string } | null;
  readonly company: { readonly raisonSociale: string; readonly enseigne: string } | null;
}): SheetCustomer | null {
  if (
    row.billedCompanyId === null ||
    row.billedCompanyId === row.companyId ||
    row.billedCompany === null ||
    row.company === null
  ) {
    return null;
  }
  return {
    tradeName: companyDisplayName(row.company),
    legalName: row.billedCompany.raisonSociale,
  };
}

/**
 * Qui a commandé, en clair. La société prime quand il y en a une ; sinon la
 * personne, par son nom si on le connaît et par son e-mail sinon — jamais un
 * identifiant technique, qui ne dit rien au téléphone ni au comptoir.
 */
function customerLabelOf(row: NameableRow): string {
  if (row.company !== null && row.company.raisonSociale !== "") {
    return row.company.raisonSociale;
  }
  const fullName = `${row.placedBy.firstName} ${row.placedBy.lastName}`.trim();
  return fullName === "" ? row.placedBy.email : fullName;
}

/**
 * Le JSON figé → la ventilation de TVA, ou `null`.
 *
 * Validé et non casté, pour la raison qui vaut déjà pour la remise : les
 * commandes antérieures à la colonne n'en portent pas, et un JSON d'une autre
 * forme ne doit pas remonter en vue. `null` se rend alors par une seule ligne
 * « dont TVA » — ce qui est vrai — plutôt que par un détail refabriqué.
 */
function parseVatShares(value: Prisma.JsonValue | null): readonly VatShareView[] | null {
  const parsed = vatSharesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Une date `@db.Date` → `YYYY-MM-DD`, ou `null`. */
function toIsoDate(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

/** Valide un snapshot d'adresse postale figée (retrait ou coursier), ou `null`. */
function parseAddress(value: Prisma.JsonValue | null): BillingAddressPayload | null {
  return value === null ? null : billingAddressPayloadSchema.parse(value);
}

export function toOrderView(row: OrderRow): OrderView {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    paymentStatus: row.paymentStatus,
    settlement: settlementRegimeOf(row.paymentStatus, row.totalCents),
    requestedDeliveryDate: toIsoDate(row.requestedDeliveryDate),
    fulfillmentMethod: row.fulfillmentMethod,
    deliveryAddressId: row.deliveryAddressId,
    deliveryAddress: parseAddress(row.deliveryAddressSnapshot),
    pickupAddress: parseAddress(row.pickupAddress),
    fulfillment: fulfillmentOf(row.fulfillment),
    note: row.note,
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    discountAdjustment: parseAdjustment(row.discountAdjustment),
    ...pickupDiscountBaseFieldOf(row),
    voucherDiscountCents: row.voucherDiscountCents,
    // Même indulgence, même barrière : un barème illisible rend `null` — la
    // facture perd le libellé de ses frais, pas son montant.
    deliveryFeeAdjustment: parseAdjustment(row.deliveryFeeAdjustment),
    deliveryFeeCents: row.deliveryFeeCents,
    lateFeeCents: row.lateFeeCents,
    lateFeeAdjustment: parseLateFee(row.lateFeeAdjustment),
    deliveryVatMode: parseDeliveryVatMode(row.deliveryVatMode),
    vatCents: row.vatCents,
    vatShares: parseVatShares(row.vatShares),
    totalCents: row.totalCents,
    currency: row.currency,
    customerLabel: customerLabelOf(row),
    companyId: row.companyId,
    fromSubscriptionId: row.fromSubscriptionId,
    origin: orderOriginOf(row),
    placedByStaffId: row.placedByStaffId,
    recurringDeltas: parseDeltas(row.recurringDeltas),
    placedAt: row.createdAt.toISOString(),
    lines: row.lines.map(toLineView),
    handoverToken: row.handoverToken,
    confirmedAt: row.confirmedAt === null ? null : row.confirmedAt.toISOString(),
    readyAt: row.readyAt === null ? null : row.readyAt.toISOString(),
    handedOverAt: row.handedOverAt === null ? null : row.handedOverAt.toISOString(),
    ...refundsOf(row.refunds),
  };
}

/** Les remboursements constatés, et leur cumul réussi (lot R1). */
function refundsOf(rows: OrderRow["refunds"]): Pick<OrderView, "refunds" | "refundedCents"> {
  const refunds = rows.map((refund) => ({
    amountCents: refund.amountCents,
    status: refund.status,
    refundedAt: refund.refundedAt.toISOString(),
  }));
  return { refunds, refundedCents: refundedCentsOf(refunds) };
}

/**
 * Snapshot JSON → l'ajustement figé de la remise, ou `null`. Validé et non casté :
 * les commandes antérieures à la colonne n'en portent pas, et un JSON d'une autre
 * forme ne doit pas remonter en vue.
 */
function parseAdjustment(value: Prisma.JsonValue | null): CartAdjustment | null {
  return value === null ? null : cartAdjustmentSchema.parse(value);
}

/**
 * Snapshot JSON → l'ajustement ET le taux figés de la surtaxe, ou `null`.
 *
 * Validé comme la remise, et pour la même raison : toute commande antérieure à
 * la colonne porte `null`, et un JSON d'une autre forme n'a pas à remonter en
 * vue. Le taux en fait partie — il ne se recalcule pas depuis le montant.
 */
function parseLateFee(value: Prisma.JsonValue | null): LateFeeAdjustment | null {
  return value === null ? null : lateFeeAdjustmentSchema.parse(value);
}

/**
 * Colonne → le mode de TVA du port figé, ou `null` (commande d'avant le
 * réglage). Validé et non casté : le CHECK tient les valeurs en base, et le
 * schéma refuse ce qu'il ne connaît pas plutôt que de l'afficher.
 */
function parseDeliveryVatMode(value: string | null): DeliveryVatMode | null {
  return value === null ? null : deliveryVatModeSchema.parse(value);
}

/** Snapshot JSON → écarts vs gabarit récurrent, ou `null`. */
function parseDeltas(value: Prisma.JsonValue | null): RecurringDeltas | null {
  return value === null ? null : recurringDeltasSchema.parse(value);
}

function toLineView(line: OrderLineRow): OrderLineView {
  return {
    sku: line.sku,
    productName: line.productNameSnapshot,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate.toNumber(),
    quantity: line.quantity,
    lineTotalCents: line.lineTotalCents,
    unitPriceTtcCents: line.unitPriceTtcCents,
    lineTotalTtcCents: line.lineTotalTtcCents,
    pricing: parseTrace(line),
    allergens: parseAllergens(line.allergens),
    ...(line.pickupDiscountEligible ? {} : { pickupDiscountEligible: false as const }),
  };
}

/**
 * « Remise retrait sur X € éligibles », lue sur les lignes **figées** — le
 * drapeau posé à la passation, jamais la règle du jour (lot C). Absente sans
 * remise ou sans ligne exclue.
 */
function pickupDiscountBaseFieldOf(row: OrderRow): Pick<OrderView, "pickupDiscountBase"> {
  const base = pickupDiscountBaseOf(
    row.discountCents > 0,
    row.lines.map((line) => ({
      sku: line.sku,
      lineTotalCents: line.lineTotalCents,
      lineTotalTtcCents: line.lineTotalTtcCents,
      eligible: line.pickupDiscountEligible,
    })),
  );
  return base === null ? {} : { pickupDiscountBase: base };
}
