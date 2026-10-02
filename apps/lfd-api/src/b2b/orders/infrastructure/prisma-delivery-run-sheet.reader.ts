import { Injectable } from "@nestjs/common";

import {
  DeliveryRunSheetReader,
  type DeliveryRunSheetEntry,
} from "../../../handover/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  addressLinksOf,
  RUN_SHEET_ADDRESS_SELECT,
  RUN_SHEET_ORDER_SELECT,
  RUN_SHEET_PROCEDURE_SELECT,
  toRunSheetEntry,
  type AddressLink,
  type RunSheetAddressRow,
  type RunSheetOrderRow,
  type RunSheetProcedureRow,
} from "./delivery-run-sheet.query.js";
import { expectedOnWhere } from "./handover-order.query.js";

/**
 * **Ce que le commerce rend pour la feuille de route** — l'adaptateur de
 * `DeliveryRunSheetReader`.
 *
 * Trois lectures, jamais une par commande : les commandes du jour (le filtre
 * de la file, `expectedOnWhere`, restreint au coursier), puis — en parallèle —
 * les adresses du carnet et leurs procédures, chacune **murée** : chaque
 * couple `(adresse, société)` entre dans le `where`, et une adresse qui
 * n'appartient pas à la société de la commande n'est pas trouvée.
 *
 * ⚠️ Pourquoi ne pas suivre la relation `deliveryAddress` dans le premier
 * `select` : une relation suivie ne porte pas de `where`, donc pas de mur. Le
 * lien est écrit sous le mur depuis le 2026-09-29, mais il se relit sous le
 * mur aussi — une donnée ancienne ou réparée à la main ne doit pas suffire à
 * servir la procédure d'une autre maison.
 */
@Injectable()
export class PrismaDeliveryRunSheetReader extends DeliveryRunSheetReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async deliveriesOn(day: string): Promise<readonly DeliveryRunSheetEntry[]> {
    const rows = await this.prisma.order.findMany({
      where: { ...expectedOnWhere(day), fulfillmentMethod: "delivery" },
      orderBy: { createdAt: "asc" },
      select: RUN_SHEET_ORDER_SELECT,
    });
    return this.entriesOf(rows);
  }

  async deliveriesAmong(orderIds: readonly string[]): Promise<readonly DeliveryRunSheetEntry[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] }, status: { not: "draft" }, fulfillmentMethod: "delivery" },
      orderBy: { createdAt: "asc" },
      select: RUN_SHEET_ORDER_SELECT,
    });
    return this.entriesOf(rows);
  }

  private async entriesOf(
    rows: readonly RunSheetOrderRow[],
  ): Promise<readonly DeliveryRunSheetEntry[]> {
    const links = addressLinksOf(rows);
    const [addresses, procedures] = await Promise.all([
      this.addressesOf(links),
      this.proceduresOf(links),
    ]);
    return rows.map((row) => toRunSheetEntry(row, addresses, procedures));
  }

  private async addressesOf(
    links: readonly AddressLink[],
  ): Promise<ReadonlyMap<string, RunSheetAddressRow>> {
    if (links.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.address.findMany({
      where: { OR: links.map((link) => ({ id: link.addressId, companyId: link.companyId })) },
      select: RUN_SHEET_ADDRESS_SELECT,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async proceduresOf(
    links: readonly AddressLink[],
  ): Promise<ReadonlyMap<string, RunSheetProcedureRow>> {
    if (links.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryProcedure.findMany({
      where: {
        OR: links.map((link) => ({ addressId: link.addressId, companyId: link.companyId })),
      },
      select: RUN_SHEET_PROCEDURE_SELECT,
    });
    return new Map(rows.map((row) => [row.addressId, row]));
  }
}
