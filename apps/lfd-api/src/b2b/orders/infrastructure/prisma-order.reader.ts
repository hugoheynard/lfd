import {
  type AdminOrderRow,
  type AdminOrdersQuery,
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type CartAdjustment,
  cartAdjustmentSchema,
  type FulfillmentMethod,
  type OrderLineView,
  type OrderLinePricingTrace,
  priceStepsSchema,
  commitmentDecisionSchema,
  floorDecisionSchema,
  type OrderStatus,
  type OrderFulfillment,
  orderFulfillmentSchema,
  type OrderView,
  type PaymentStatus,
  type ProductionContact,
  type ProductionSheet,
  type RecurringDeltas,
  recurringDeltasSchema,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderReader, type HandoverOrder, type OwnedOrder } from "../domain/ports/order.reader.js";
import { orderOriginOf } from "../domain/services/order-origin.js";

/** Une ligne de commande telle que Prisma la sélectionne. */
interface OrderLineRow {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly unitPriceCents: number;
  readonly vatRate: { toNumber(): number };
  readonly quantity: number;
  readonly lineTotalCents: number;
  readonly basePriceCents: number | null;
  readonly pricingSteps: Prisma.JsonValue | null;
  readonly pricingFloored: boolean | null;
  readonly pricingFloor: Prisma.JsonValue | null;
  readonly pricingCommitment: Prisma.JsonValue | null;
}

/** Une commande telle que Prisma la sélectionne. */
interface OrderRow {
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
  readonly deliveryFeeCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly fromSubscriptionId: string | null;
  readonly placedByStaffId: string | null;
  readonly recurringDeltas: Prisma.JsonValue | null;
  readonly handoverToken: string | null;
  readonly handedOverAt: Date | null;
  readonly createdAt: Date;
  readonly lines: readonly OrderLineRow[];
}

/** Colonnes d'une commande à lire (partagées entreprise / personnel). */
const ORDER_SELECT = {
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
  deliveryFeeCents: true,
  vatCents: true,
  totalCents: true,
  currency: true,
  fromSubscriptionId: true,
  placedByStaffId: true,
  recurringDeltas: true,
  handoverToken: true,
  handedOverAt: true,
  createdAt: true,
  lines: {
    select: {
      sku: true,
      productNameSnapshot: true,
      unitPriceCents: true,
      vatRate: true,
      quantity: true,
      lineTotalCents: true,
      basePriceCents: true,
      pricingSteps: true,
      pricingFloored: true,
      pricingFloor: true,
      pricingCommitment: true,
    },
  },
} as const;

/** Lecture des commandes (entreprise ou personnel), la plus récente en tête. */
@Injectable()
export class PrismaOrderReader extends OrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByCompany(companyId: string): Promise<readonly OrderView[]> {
    const rows = await this.prisma.order.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: ORDER_SELECT,
    });
    return rows.map((row) => toOrderView(row));
  }

  async listPersonal(userId: string): Promise<readonly OrderView[]> {
    const rows = await this.prisma.order.findMany({
      // Personnel = passée par ce client ET sans entreprise (le mur).
      where: { placedByUserId: userId, companyId: null },
      orderBy: { createdAt: "desc" },
      select: ORDER_SELECT,
    });
    return rows.map((row) => toOrderView(row));
  }

  /**
   * La liste staff. Une seule requête, avec les deux jointures qui nomment le
   * client : la société si elle existe, la personne sinon. Les résoudre côté
   * écran aurait voulu dire N appels pour une liste de N lignes.
   */
  async listForAdmin(query: AdminOrdersQuery): Promise<readonly AdminOrderRow[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        ...(query.companyId === undefined ? {} : { companyId: query.companyId }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfillmentMethod: true,
        subtotalCents: true,
        vatCents: true,
        totalCents: true,
        companyId: true,
        fromSubscriptionId: true,
        placedByStaffId: true,
        createdAt: true,
        company: { select: { raisonSociale: true } },
        placedBy: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    return rows.map(toAdminRow);
  }

  async findById(orderId: string): Promise<OwnedOrder | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        ...ORDER_SELECT,
        companyId: true,
        placedByUserId: true,
        stripePaymentIntentId: true,
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
    };
  }

  async findByHandoverToken(token: string): Promise<HandoverOrder | null> {
    const row = await this.prisma.order.findUnique({
      where: { handoverToken: token },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        fulfillmentMethod: true,
        requestedDeliveryDate: true,
        pickupAddress: true,
        handedOverAt: true,
        handedOverBy: true,
        createdAt: true,
        companyId: true,
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
      customerLabel: customerLabelOf(row),
      placedAt: row.createdAt,
      requestedDeliveryDate: row.requestedDeliveryDate,
      pickupLabel: pickupLabelOf(row.pickupAddress),
      status: row.status,
      fulfillmentMethod: row.fulfillmentMethod,
      handedOverAt: row.handedOverAt,
      handedOverBy: row.handedOverBy,
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
  async listForProduction(date: string): Promise<readonly ProductionSheet[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        requestedDeliveryDate: new Date(`${date}T00:00:00.000Z`),
        status: { not: "cancelled" },
      },
      orderBy: { orderNumber: "asc" },
      select: {
        id: true,
        orderNumber: true,
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
    return rows.map((row) => this.toSheet(row));
  }

  /** Une ligne de commande → une fiche. Extrait pour tenir la limite de lignes. */
  private toSheet(row: ProductionRow): ProductionSheet {
    const agreed = fulfillmentOf(row.fulfillment);
    return {
      orderId: row.id,
      orderNumber: row.orderNumber,
      tradeName: row.company?.enseigne ?? "",
      legalName: customerLabelOf(row),
      fulfillmentMethod: row.fulfillmentMethod,
      pickupLabel: pickupLabelOf(row.pickupAddress),
      pickupAddress: parseAddress(row.pickupAddress),
      deliveryAddress: parseAddress(row.deliveryAddressSnapshot),
      deliveryContact: contactOf(agreed, row.company),
      window: agreed.window.value,
      signatureRequired: agreed.signatureRequired.value,
      note: row.note,
      origin: orderOriginOf(row),
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    };
  }
}

/**
 * L'acheminement convenu, figé en JSON. Validé plutôt que casté — et le **repli
 * est explicite** : une commande antérieure à la colonne n'en porte pas, elle
 * rend alors « rien de convenu, tout par défaut » plutôt qu'un contact inventé.
 */
function fulfillmentOf(value: Prisma.JsonValue | null): OrderFulfillment {
  const parsed = orderFulfillmentSchema.safeParse(value);
  return parsed.success ? parsed.data : NOTHING_AGREED;
}

/** Ce que dit une commande qui n'a jamais rien convenu : rien, et par défaut. */
const NOTHING_AGREED: OrderFulfillment = {
  window: { value: null, source: "default" },
  contact: { value: null, source: "default" },
  signatureRequired: { value: false, source: "default" },
};

/**
 * **Qui appeler en livrant**, dans l'ordre : le contact convenu sur la commande,
 * puis le détenteur du compte, puis personne.
 *
 * La fiche ne relit **plus le carnet d'adresses**. Elle le faisait, et c'était
 * le défaut : changer le contact d'une adresse réécrivait des bons déjà partis
 * en tournée. Ce qui a été convenu à la passation est figé sur la commande, et
 * ce qui bouge ensuite passe par un avenant.
 *
 * Le détenteur reste une lecture vivante, faute de mieux — mais il ne change
 * pas d'un jour à l'autre comme un réglage, et c'est un repli, pas la règle.
 * Rendre `null` plutôt qu'un nom bricolé permet à la fiche d'écrire « aucun
 * contact », ce qui est une information et pas un blanc.
 */
function contactOf(agreed: OrderFulfillment, company: HolderSide | null): ProductionContact | null {
  const onOrder = agreed.contact.value;
  if (onOrder !== null) {
    return {
      source: "order",
      name: `${onOrder.prenom} ${onOrder.nom}`.trim(),
      phone: onOrder.telephone,
    };
  }
  const holder = company?.memberships[0]?.user;
  if (holder === undefined) {
    return null;
  }
  const name = `${holder.firstName} ${holder.lastName}`.trim();
  return name === "" ? null : { source: "holder", name, phone: holder.phone };
}

/** Le détenteur du compte tel que la requête le ramène (0 ou 1 ligne). */
interface HolderSide {
  readonly memberships: readonly {
    readonly user: {
      readonly firstName: string;
      readonly lastName: string;
      readonly phone: string;
    };
  }[];
}

/** Ce que Prisma rend pour une fiche de production. */
interface ProductionRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly pickupAddress: Prisma.JsonValue | null;
  readonly deliveryAddressSnapshot: Prisma.JsonValue | null;
  readonly note: string;
  readonly fromSubscriptionId: string | null;
  readonly placedByStaffId: string | null;
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

/**
 * Le nom du point de retrait figé à la commande. Le snapshot est validé plutôt
 * que casté — une commande antérieure au point de retrait n'en porte pas, et un
 * JSON d'une autre forme ne doit pas remonter en vue.
 */
function pickupLabelOf(value: Prisma.JsonValue | null): string | null {
  const address = parseAddress(value);
  if (address === null || address.label === "") {
    return null;
  }
  return address.label;
}

/** Ce que Prisma rend pour la liste staff (les deux jointures incluses). */
interface AdminRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly companyId: string | null;
  readonly fromSubscriptionId: string | null;
  readonly placedByStaffId: string | null;
  readonly createdAt: Date;
  readonly company: { readonly raisonSociale: string } | null;
  readonly placedBy: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
  };
}

function toAdminRow(row: AdminRow): AdminOrderRow {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.createdAt.toISOString(),
    status: row.status,
    paymentStatus: row.paymentStatus,
    fulfillmentMethod: row.fulfillmentMethod,
    subtotalCents: row.subtotalCents,
    vatCents: row.vatCents,
    totalCents: row.totalCents,
    customerLabel: customerLabelOf(row),
    companyId: row.companyId,
    origin: orderOriginOf(row),
  };
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

/** Une date `@db.Date` → `YYYY-MM-DD`, ou `null`. */
function toIsoDate(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

/** Valide un snapshot d'adresse postale figée (retrait ou coursier), ou `null`. */
function parseAddress(value: Prisma.JsonValue | null): BillingAddressPayload | null {
  return value === null ? null : billingAddressPayloadSchema.parse(value);
}

function toOrderView(row: OrderRow): OrderView {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    paymentStatus: row.paymentStatus,
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
    deliveryFeeCents: row.deliveryFeeCents,
    vatCents: row.vatCents,
    totalCents: row.totalCents,
    currency: row.currency,
    fromSubscriptionId: row.fromSubscriptionId,
    origin: orderOriginOf(row),
    placedByStaffId: row.placedByStaffId,
    recurringDeltas: parseDeltas(row.recurringDeltas),
    placedAt: row.createdAt.toISOString(),
    lines: row.lines.map(toLineView),
    handoverToken: row.handoverToken,
    handedOverAt: row.handedOverAt === null ? null : row.handedOverAt.toISOString(),
  };
}

/**
 * Snapshot JSON → l'ajustement figé de la remise, ou `null`. Validé et non casté :
 * les commandes antérieures à la colonne n'en portent pas, et un JSON d'une autre
 * forme ne doit pas remonter en vue.
 */
function parseAdjustment(value: Prisma.JsonValue | null): CartAdjustment | null {
  return value === null ? null : cartAdjustmentSchema.parse(value);
}

/** Snapshot JSON → écarts vs gabarit récurrent, ou `null`. */
function parseDeltas(value: Prisma.JsonValue | null): RecurringDeltas | null {
  return value === null ? null : recurringDeltasSchema.parse(value);
}

function toLineView(line: OrderLineRow): OrderLineView {
  return {
    sku: line.sku,
    productName: line.productNameSnapshot,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate.toNumber(),
    quantity: line.quantity,
    lineTotalCents: line.lineTotalCents,
    pricing: parseTrace(line),
  };
}

/**
 * La trace, **validée** plutôt que castée.
 *
 * Elle a été écrite en JSON par une version du code ; elle est relue par une
 * autre, des mois plus tard. Zod est la seule barrière entre les deux — et une
 * trace illisible rend `null` (« on ne sait pas ») au lieu de lever : une
 * facture doit rester consultable même si l'explication de son prix ne l'est
 * plus. C'est l'inverse de l'arbitrage fait sur les RÈGLES, et pour une raison
 * nette : là-bas une donnée illisible ferait FACTURER un prix que personne n'a
 * décidé ; ici elle empêche seulement de commenter un prix déjà facturé.
 */
function parseTrace(line: OrderLineRow): OrderLinePricingTrace | null {
  if (line.basePriceCents === null || line.pricingFloored === null) {
    return null;
  }
  const steps = priceStepsSchema.safeParse(line.pricingSteps);
  if (!steps.success) {
    return null;
  }
  return {
    basePriceCents: line.basePriceCents,
    steps: steps.data,
    floored: line.pricingFloored,
    // Une décision illisible rend `null` sans emporter le reste de la trace : le
    // détail des étages reste consultable, on perd seulement le commentaire du
    // plancher.
    floorDecision: floorDecisionSchema.safeParse(line.pricingFloor).data ?? null,
    // Même indulgence, même raison : l'engagement explique un palier, il ne le
    // refait pas. Illisible, on perd l'explication, pas la commande.
    commitment: commitmentDecisionSchema.safeParse(line.pricingCommitment).data ?? null,
  };
}
