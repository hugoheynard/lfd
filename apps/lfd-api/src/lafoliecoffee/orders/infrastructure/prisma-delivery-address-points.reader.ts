import { deliverySpecsSchema, type GpsPoint } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  DeliveryAddressPointsReader,
  type DeliveryOrderAddress,
} from "../../../delivery/channels/commerce/index.js";
import { AddressKind } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { customerLabelOf } from "./handover-order.query.js";

/** Ce qu'une commande dit de son adresse : le lien, la société, le nom du client. */
const ORDER_SELECT = {
  id: true,
  companyId: true,
  deliveryAddressId: true,
  company: { select: { raisonSociale: true } },
  placedBy: { select: { email: true, firstName: true, lastName: true } },
} as const;

/** Ce qu'on lit d'une adresse du carnet — ses lignes et ses deux points. */
const ADDRESS_SELECT = {
  id: true,
  companyId: true,
  label: true,
  ligne1: true,
  ligne2: true,
  codePostal: true,
  ville: true,
  pays: true,
  deliverySpecs: true,
  parkingLat: true,
  parkingLng: true,
} as const;

interface AddressRow {
  readonly id: string;
  readonly companyId: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly deliverySpecs: unknown;
  readonly parkingLat: number | null;
  readonly parkingLng: number | null;
}

/**
 * **Les adresses du carnet derrière des commandes**, pour les suggestions de
 * correction (`gps-y-aller-et-position.md`, §6) — l'adaptateur de
 * `DeliveryAddressPointsReader`.
 *
 * Le mur est dans la requête, comme pour la feuille de route : chaque couple
 * `(adresse, société)` de la commande entre dans le `where`, avec les seules
 * adresses de LIVRAISON encore au carnet. Une commande dont l'adresse est
 * archivée, d'une autre société, ou absente n'est pas rendue.
 *
 * Des consignes illisibles se lisent « sans porte » : on ne suggère pas
 * contre un point qu'on ne sait pas lire, et on ne lève pas pour autant — une
 * adresse mal formée ne doit pas éteindre toute la liste du bureau.
 */
@Injectable()
export class PrismaDeliveryAddressPointsReader extends DeliveryAddressPointsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async addressesOfOrders(orderIds: readonly string[]): Promise<readonly DeliveryOrderAddress[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const orders = await this.prisma.order.findMany({
      where: {
        id: { in: [...orderIds] },
        deliveryAddressId: { not: null },
        companyId: { not: null },
      },
      select: ORDER_SELECT,
    });
    const links = orders.flatMap((order) =>
      order.deliveryAddressId === null || order.companyId === null
        ? []
        : [{ id: order.deliveryAddressId, companyId: order.companyId }],
    );
    if (links.length === 0) {
      return [];
    }
    const rows = await this.prisma.address.findMany({
      where: { OR: links, kind: AddressKind.delivery, archivedAt: null },
      select: ADDRESS_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return orders.flatMap((order) => {
      const row = order.deliveryAddressId === null ? undefined : byId.get(order.deliveryAddressId);
      // Défense en profondeur : le mapper revérifie la société de la commande.
      if (row === undefined || row.companyId !== order.companyId) {
        return [];
      }
      return [{ orderId: order.id, customerLabel: customerLabelOf(order), ...addressOf(row) }];
    });
  }
}

function addressOf(row: AddressRow): Omit<DeliveryOrderAddress, "orderId" | "customerLabel"> {
  const specs = deliverySpecsSchema.safeParse(row.deliverySpecs);
  return {
    addressId: row.id,
    companyId: row.companyId,
    addressLabel: row.label,
    address: {
      label: row.label,
      ligne1: row.ligne1,
      ligne2: row.ligne2,
      codePostal: row.codePostal,
      ville: row.ville,
      pays: row.pays,
    },
    door: specs.success ? specs.data.gps : null,
    parking: pointOf(row.parkingLat, row.parkingLng),
  };
}

function pointOf(lat: number | null, lng: number | null): GpsPoint | null {
  return lat === null || lng === null ? null : { lat, lng };
}
