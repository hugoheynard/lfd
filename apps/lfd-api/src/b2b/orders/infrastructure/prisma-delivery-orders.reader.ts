import { Injectable } from "@nestjs/common";

import {
  type DeliveryOrderFacts,
  type DeliveryOrderRef,
  DeliveryOrdersReader,
  type DeliveryStopPoint,
  type DepartureSheet,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { deliverySpecsSchema, type DoorstepRule, doorstepRuleSchema } from "@lfd/contracts";

import { type AddressLink, snapshotOf } from "./delivery-run-sheet.query.js";
import { customerLabelOf, expectedOnWhere } from "./handover-order.query.js";
import { fulfillmentOf, windowOf } from "./order-fulfillment.parse.js";

/** Ce que la composition lit d'une commande : ni montant, ni adresse. */
const DELIVERY_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  requestedDeliveryDate: true,
} as const;

/** Le nom du client — la règle de la file du comptoir (`customerLabelOf`). */
const CUSTOMER_SELECT = {
  company: { select: { raisonSociale: true } },
  placedBy: { select: { email: true, firstName: true, lastName: true } },
} as const;

/**
 * Ce que le départ fige (lot 4). 🔴 **Aucun montant** : un total servi au
 * livreur serait lu comme une somme à encaisser à la porte.
 */
const DEPARTURE_SHEET_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  companyId: true,
  deliveryAddressId: true,
  fulfillment: true,
  note: true,
  deliveryAddressSnapshot: true,
  ...CUSTOMER_SELECT,
} as const;

/** Ce que le calculateur lit d'une commande (lot 7) : le lien, l'adresse figée, la fenêtre. */
const STOP_POINT_SELECT = {
  id: true,
  orderNumber: true,
  companyId: true,
  deliveryAddressId: true,
  fulfillment: true,
  deliveryAddressSnapshot: true,
} as const;

/** Les consignes d'une adresse du carnet, telles que le mur les rend. */
interface AddressSpecs {
  readonly companyId: string;
  readonly note: string;
  readonly gps: { readonly lat: number; readonly lng: number } | null;
  readonly stopMinutes: number | null;
  /** « Dépôt autorisé » (`plan-a-la-porte.md`, AP-D5) — une colonne, pas une consigne. */
  readonly depositAllowed: boolean;
  /** La décision réglée d'avance de l'adresse (B3 bis) ; `null` : elle hérite. */
  readonly doorstepRule: DoorstepRule | null;
}

interface DeliveryOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly fulfillmentMethod: string;
  readonly requestedDeliveryDate: Date | null;
}

/**
 * **Ce que le commerce rend pour la livraison** — l'adaptateur de
 * `DeliveryOrdersReader` (plan de tournée, lot 3, C4, C15 ; lot 4).
 *
 * « Attendue ce jour » est `expectedOnWhere`, le filtre de la file du comptoir
 * et de la feuille de route, restreint au coursier comme la feuille de route :
 * une seule vérité sur ce qui part. Les annulées sont rendues — « à répartir »
 * les écarte, les arrêts les signalent.
 *
 * Le jour demandé est une clé de journée écrite en minuit UTC
 * (`expectedOnWhere`) : il se relit de la même façon, jamais comme un instant.
 *
 * La feuille du départ reprend les lectures de la feuille de route
 * (`snapshotOf`, `fulfillmentOf`, `windowOf`) : ce que le livreur voit figé est
 * ce qu'il voyait vivant la veille.
 */
@Injectable()
export class PrismaDeliveryOrdersReader extends DeliveryOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async expectedOn(day: string): Promise<readonly DeliveryOrderRef[]> {
    const rows = await this.prisma.order.findMany({
      where: { ...expectedOnWhere(day), fulfillmentMethod: "delivery" },
      orderBy: { createdAt: "asc" },
      select: DELIVERY_ORDER_SELECT,
    });
    return rows.map((row) => refOf(row));
  }

  async byIds(orderIds: readonly string[]): Promise<readonly DeliveryOrderFacts[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: { ...DELIVERY_ORDER_SELECT, ...CUSTOMER_SELECT },
    });
    return rows.map((row) => ({
      ...refOf(row),
      customerLabel: customerLabelOf(row),
      day: row.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      delivery: row.fulfillmentMethod === "delivery",
    }));
  }

  async departureSheetsOf(orderIds: readonly string[]): Promise<readonly DepartureSheet[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: DEPARTURE_SHEET_SELECT,
    });
    const notes = await this.addressNotesOf(linksOf(rows));
    return rows.map((row) => {
      const agreed = fulfillmentOf(row.fulfillment);
      const linked = row.deliveryAddressId === null ? undefined : notes.get(row.deliveryAddressId);
      const note = linked?.companyId === row.companyId ? linked : undefined;
      return {
        orderId: row.id,
        reference: row.orderNumber,
        customerLabel: customerLabelOf(row),
        address: snapshotOf(row.deliveryAddressSnapshot),
        contact: agreed.contact.value,
        window: windowOf(agreed),
        signatureRequired: agreed.signatureRequired.value,
        note: row.note,
        addressNote: note === undefined ? null : note.note,
        // Sans adresse du carnet reliée (sous le mur), rien n'est autorisé.
        depositAllowed: note?.depositAllowed ?? false,
        // Sans adresse reliée, rien n'est redéfini : la livraison applique son réglage.
        doorstepRule: note?.doorstepRule ?? null,
        status: row.status === "cancelled" ? "cancelled" : "active",
      };
    });
  }

  /**
   * Le point GPS du carnet, lu SOUS LE MUR comme la note ; l'adresse livrée
   * FIGÉE à la passation, jamais le carnet vivant (lot 7, L7-C8).
   */
  async stopPointsOf(orderIds: readonly string[]): Promise<readonly DeliveryStopPoint[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: STOP_POINT_SELECT,
    });
    const specs = await this.addressNotesOf(linksOf(rows));
    return rows.map((row) => {
      const linked = row.deliveryAddressId === null ? undefined : specs.get(row.deliveryAddressId);
      const window = windowOf(fulfillmentOf(row.fulfillment));
      const walled = linked?.companyId === row.companyId ? linked : undefined;
      return {
        orderId: row.id,
        reference: row.orderNumber,
        gps: walled?.gps ?? null,
        stopMinutes: walled?.stopMinutes ?? null,
        address: snapshotOf(row.deliveryAddressSnapshot),
        window: window === null ? null : { start: window.start, end: window.end },
      };
    });
  }

  /**
   * Les consignes des adresses du carnet — note, point GPS, temps de livraison
   * sur place —, lues SOUS LE
   * MUR comme la feuille de route : chaque couple `(adresse, société)` entre
   * dans le `where`, et le mapper revérifie la société. Validées, jamais
   * castées.
   */
  private async addressNotesOf(
    links: readonly AddressLink[],
  ): Promise<ReadonlyMap<string, AddressSpecs>> {
    if (links.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.address.findMany({
      where: { OR: links.map((link) => ({ id: link.addressId, companyId: link.companyId })) },
      select: {
        id: true,
        companyId: true,
        deliverySpecs: true,
        depositAllowed: true,
        doorstepRule: true,
      },
    });
    return new Map(
      rows.map((row) => {
        const specs = deliverySpecsSchema.safeParse(row.deliverySpecs);
        return [
          row.id,
          {
            companyId: row.companyId,
            note: specs.success ? specs.data.note : "",
            gps: specs.success ? specs.data.gps : null,
            stopMinutes: specs.success ? (specs.data.stopMinutes ?? null) : null,
            depositAllowed: row.depositAllowed,
            doorstepRule:
              row.doorstepRule === null ? null : doorstepRuleSchema.parse(row.doorstepRule),
          },
        ];
      }),
    );
  }
}

/** Les liens d'adresse à relire ; une commande sans société n'en a aucun. */
function linksOf(
  rows: readonly {
    readonly deliveryAddressId: string | null;
    readonly companyId: string | null;
  }[],
): readonly AddressLink[] {
  return rows.flatMap((row) =>
    row.deliveryAddressId === null || row.companyId === null
      ? []
      : [{ addressId: row.deliveryAddressId, companyId: row.companyId }],
  );
}

function refOf(row: DeliveryOrderRow): DeliveryOrderRef {
  return {
    orderId: row.id,
    reference: row.orderNumber,
    status: row.status === "cancelled" ? "cancelled" : "active",
  };
}
