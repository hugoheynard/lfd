import {
  orderLineAllergensSchema,
  type OrderLineAllergens,
  type AdminOrderRow,
  type AdminOrdersQuery,
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type CartAdjustment,
  cartAdjustmentSchema,
  type FulfillmentMethod,
  type LateFeeAdjustment,
  lateFeeAdjustmentSchema,
  type OrderLineView,
  type OrderLinePricingTrace,
  priceStepsSchema,
  commitmentDecisionSchema,
  rejectedRulesSchema,
  floorDecisionSchema,
  type OrderStatus,
  type OrderFulfillment,
  orderFulfillmentSchema,
  type OrderView,
  type PaymentStatus,
  type SheetContact,
  type AtelierSheet,
  type RecurringDeltas,
  recurringDeltasSchema,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderReader,
  type HandoverOrder,
  type HandoverQueueOrder,
  type HandoverQueueWindow,
  type OwnedOrder,
  type PackingOrder,
} from "../domain/ports/order.reader.js";
import { vatSharesSchema, type VatShareView } from "@lfd/contracts";

import { orderOriginOf } from "../domain/services/order-origin.js";

/** Une ligne de commande telle que Prisma la sélectionne. */
interface OrderLineRow {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly unitPriceMillicents: number;
  readonly vatRate: { toNumber(): number };
  readonly quantity: number;
  readonly lineTotalCents: number;
  readonly basePriceMillicents: number | null;
  readonly pricingSteps: Prisma.JsonValue | null;
  readonly pricingFloored: boolean | null;
  readonly pricingClampedToZero: boolean | null;
  readonly pricingFloor: Prisma.JsonValue | null;
  readonly allergens: Prisma.JsonValue | null;
  readonly pricingCommitment: Prisma.JsonValue | null;
  readonly pricingRejected: Prisma.JsonValue | null;
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
  readonly deliveryFeeAdjustment: Prisma.JsonValue | null;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: Prisma.JsonValue | null;
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
  deliveryFeeAdjustment: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
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
      basePriceMillicents: true,
      pricingSteps: true,
      pricingFloored: true,
      pricingClampedToZero: true,
      pricingFloor: true,
      pricingCommitment: true,
      pricingRejected: true,
      allergens: true,
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

  async findByHandoverToken(token: string): Promise<HandoverOrder | null> {
    return this.oneHandover({ handoverToken: token });
  }

  async findHandoverByReference(reference: string): Promise<HandoverOrder | null> {
    return this.oneHandover({ orderNumber: reference });
  }

  async findHandoverByOrderId(orderId: string): Promise<HandoverOrder | null> {
    return this.oneHandover({ id: orderId });
  }

  /**
   * La même lecture, trois clés. Le scan la trouve par un **secret**, la remise
   * saisie par le **numéro**, le rail de la file par l'**identifiant** qu'elle
   * vient de rendre — mais ce qu'on lit ensuite est identique, et le dupliquer
   * ferait diverger les écrans du comptoir au premier champ ajouté.
   *
   * ⚠️ Elle ne lit plus `handed_over_*` depuis le 2026-09-07 : ces colonnes sont
   * devenues le **snapshot** de ce que le fournil annonce, et c'est lui qui les
   * détient. Les relire pour les lui rendre ferait de la copie la source.
   */
  private async oneHandover(
    where:
      | { readonly handoverToken: string }
      | { readonly orderNumber: string }
      | { readonly id: string },
  ): Promise<HandoverOrder | null> {
    const row = await this.prisma.order.findUnique({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        fulfillmentMethod: true,
        requestedDeliveryDate: true,
        pickupAddress: true,
        createdAt: true,
        companyId: true,
        placedByUserId: true,
        // La note est sur le bon qu'on coche : « sans sésame », « par la cour ».
        note: true,
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
      placedAt: row.createdAt,
      requestedDeliveryDate: row.requestedDeliveryDate,
      pickupLabel: pickupLabelOf(row.pickupAddress),
      status: row.status,
      fulfillmentMethod: row.fulfillmentMethod,
      note: row.note,
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    };
  }

  /**
   * **La file du comptoir**, pour un jour de service.
   *
   * Trois choix, et chacun se paie s'il est fait autrement :
   *
   * - **le total en pièces est calculé EN BASE** (`_sum` sur les lignes) plutôt
   *   que rapatrié : une matinée fait des dizaines de commandes, et charger
   *   toutes leurs lignes pour n'en ouvrir qu'une est exactement le gaspillage
   *   que `HandoverSubjectReader` évite déjà commande par commande ;
   * - **les annulées sont RENDUES**, contrairement à `listForProduction` qui les
   *   écarte. Le fournil n'a rien à cuire pour elles ; le comptoir, lui, peut
   *   voir le client se présenter, et c'est `handoverBlocker` qui doit refuser
   *   avec la phrase à lire — pas une liste qui les cache ;
   * - **les brouillons sont écartés** : une commande jamais passée n'attend
   *   personne, et l'afficher ferait promettre un sac qui n'existe pas.
   *
   * ⚠️ L'ordre vient de la base (`created_at`), pas du créneau : trier par heure
   * demanderait de lire un JSON, donc de tout rapatrier pour trier. L'écran
   * ordonne ce qu'il affiche — c'est le seul endroit qui sait quel onglet il
   * peint.
   */
  async expectedForHandoverOn(day: string): Promise<readonly HandoverQueueOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        status: { not: "draft" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        fulfillmentMethod: true,
        pickupAddress: true,
        fulfillment: true,
        readyAt: true,
        createdAt: true,
        companyId: true,
        company: { select: { raisonSociale: true, enseigne: true } },
        placedBy: { select: { email: true, firstName: true, lastName: true } },
        lines: { select: { quantity: true } },
      },
    });
    return rows.map((row) => ({
      orderId: row.id,
      reference: row.orderNumber,
      customerLabel: customerLabelOf(row),
      tradeName: tradeNameOf(row.company, customerLabelOf(row)),
      pickupLabel: pickupLabelOf(row.pickupAddress),
      fulfillmentMethod: row.fulfillmentMethod,
      window: windowOf(fulfillmentOf(row.fulfillment)),
      totalUnits: row.lines.reduce((sum, line) => sum + line.quantity, 0),
      status: row.status,
      readyAt: row.readyAt,
      placedAt: row.createdAt,
    }));
  }

  /**
   * Le lot d'une journée. La colonne est `@db.Date` : **égalité stricte** sur le
   * jour, pas d'intervalle à composer, et l'index posé sur elle sert.
   */
  async listForProduction(date: string): Promise<readonly AtelierSheet[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        requestedDeliveryDate: new Date(`${date}T00:00:00.000Z`),
        status: { not: "cancelled" },
      },
      orderBy: { orderNumber: "asc" },
      select: {
        id: true,
        orderNumber: true,
        // `created_at` EST la date de passation — le schéma le dit en commentaire
        // sur la colonne. Il n'existe pas de `placed_at`.
        createdAt: true,
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
        pickupLabel: pickupLabelOf(row.pickupAddress),
        window: agreed.window.value,
        contact: contactOf(agreed, row.company),
        signatureRequired: agreed.signatureRequired.value,
      },
      note: row.note,
      origin: orderOriginOf(row),
      // L'instant de la RÉVISION, pas du tirage : deux impressions de la même
      // journée doivent porter la même date, sinon deux piles du même jour
      // paraissent dire deux choses.
      issuedAt: row.createdAt.toISOString(),
      revision: 0,
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

/**
 * Le créneau convenu, **avec sa provenance**, ou `null` s'il n'y en a pas.
 *
 * 🔴 La provenance traverse le port au lieu d'être aplatie. Un `end` en
 * `source: "default"` est une heure d'ouverture recopiée à la passation, pas une
 * promesse — et le backfill du 2026-08-15 en a posé une sur TOUTES les commandes
 * antérieures. Un écran qui ne verrait que l'heure calculerait un retard sur
 * l'intégralité du portefeuille d'un coup.
 */
function windowOf(agreed: OrderFulfillment): HandoverQueueWindow | null {
  const window = agreed.window.value;
  return window === null
    ? null
    : { start: window.start, end: window.end, source: agreed.window.source };
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
function contactOf(agreed: OrderFulfillment, company: HolderSide | null): SheetContact | null {
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
  readonly createdAt: Date;
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

/**
 * **L'enseigne, quand elle dit quelque chose de plus.**
 *
 * 🔴 Deux absences se confondent dans cette colonne, et une seule réponse les
 * couvre : `enseigne` vaut `""` par défaut sur toute société qui n'en a jamais
 * déclaré (`account.prisma`), et une maison peut aussi avoir recopié sa raison
 * sociale dans les deux champs. Dans les deux cas le comptoir n'a qu'UN nom à
 * lire, et le rendre deux fois est pire que de ne pas le rendre : on croit à
 * deux clients homonymes le temps d'un regard.
 *
 * La comparaison est faite ici, au seul endroit qui lit la colonne. Laissée à
 * l'écran, elle serait refaite par chaque écran, et oubliée par un.
 */
function tradeNameOf(
  company: { readonly enseigne: string } | null,
  customerLabel: string,
): string | null {
  const trade = company?.enseigne.trim() ?? "";
  return trade === "" || trade === customerLabel ? null : trade;
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
    // Même indulgence, même barrière : un barème illisible rend `null` — la
    // facture perd le libellé de ses frais, pas son montant.
    deliveryFeeAdjustment: parseAdjustment(row.deliveryFeeAdjustment),
    deliveryFeeCents: row.deliveryFeeCents,
    lateFeeCents: row.lateFeeCents,
    lateFeeAdjustment: parseLateFee(row.lateFeeAdjustment),
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
    pricing: parseTrace(line),
    allergens: parseAllergens(line.allergens),
  };
}

/**
 * Les allergènes figés, **validés** plutôt que castés — et une forme illisible
 * rend `null`, jamais `[]`.
 *
 * C'est le même arbitrage que la trace de prix, avec un enjeu qui n'est pas le
 * même : une facture doit rester consultable même si l'explication de son prix
 * ne l'est plus. Ici, retomber sur une liste vide ferait AFFIRMER « aucun
 * allergène » sur une commande dont on ne sait plus rien — la seule affirmation
 * que ce dépôt ne doit jamais fabriquer.
 */
function parseAllergens(value: Prisma.JsonValue | null): OrderLineAllergens | null {
  if (value === null) {
    return null;
  }
  const parsed = orderLineAllergensSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
  if (line.basePriceMillicents === null || line.pricingFloored === null) {
    return null;
  }
  const steps = priceStepsSchema.safeParse(line.pricingSteps);
  if (!steps.success) {
    return null;
  }
  return {
    basePriceMillicents: line.basePriceMillicents,
    steps: steps.data,
    floored: line.pricingFloored,
    // `null` traverse tel quel : « on ne sait pas » n'est pas « ça n'est pas
    // arrivé », et le réduire à `false` affirmerait quelque chose sur les
    // seules commandes qu'on ne peut plus vérifier.
    clampedToZero: line.pricingClampedToZero,
    // Une décision illisible rend `null` sans emporter le reste de la trace : le
    // détail des étages reste consultable, on perd seulement le commentaire du
    // plancher.
    floorDecision: floorDecisionSchema.safeParse(line.pricingFloor).data ?? null,
    // Même indulgence, même raison : l'engagement explique un palier, il ne le
    // refait pas. Illisible, on perd l'explication, pas la commande.
    commitment: commitmentDecisionSchema.safeParse(line.pricingCommitment).data ?? null,
    // **Même indulgence, et il faut la dire** : une entrée illisible ne fait
    // perdre que le commentaire, jamais la commande. `null` couvre donc deux
    // cas — la ligne d'avant la colonne, et la valeur qu'on ne sait plus lire —
    // et les deux se traitent pareil à l'écran : on se tait. Un `[]` de repli
    // affirmerait « le moteur n'a écarté personne », ce qui est exactement la
    // phrase qu'on ne doit pas fabriquer (R25).
    rejected: rejectedRulesSchema.safeParse(line.pricingRejected).data ?? null,
  };
}
