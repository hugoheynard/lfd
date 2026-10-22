import { Injectable } from "@nestjs/common";

import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { orderCategoryColor, type SiteColorSet } from "../domain/services/order-category-color.js";
import { siteIdOf } from "./pickup-site.parse.js";

const COLORS_SELECT = {
  id: true,
  pickupColorB2b: true,
  pickupColorB2c: true,
  deliveryColorB2b: true,
  deliveryColorB2c: true,
} as const;

/**
 * **La couleur de plusieurs commandes, en une lecture** — la règle du bon
 * (`orderCategoryColor`, même résolution du site que
 * `PrismaOrderSheetColorSource`) pour les papiers qui en regroupent plusieurs :
 * fiche d'atelier et dossier du jour au fournil, transfert interne de la
 * feuille de tournée (plan `comptabilite/plan-planche-des-documents-v2.md`,
 * §0 bis, décisions de Hugo du 2026-10-22).
 *
 * Lue AU TIRAGE, au départ actuel : rien n'est figé. Une commande inconnue,
 * sans clientèle, sans site résolu ou dont la couleur n'est pas posée est
 * ABSENTE de la carte — pas de pastille, jamais une teinte inventée.
 *
 * Classe du commerce, branchée sur les ports de la production et de la
 * livraison dans `appBootstrap` ; aucun des deux ne la connaît.
 */
@Injectable()
export class PrismaOrderPrintColors {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departure: DepartureSiteReader,
  ) {}

  async colorsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const orders = await this.prisma.order.findMany({
      where: { id: { in: [...new Set(orderIds)] } },
      select: { id: true, fulfillmentMethod: true, clientele: true, pickupAddress: true },
    });
    const resolved = orders.map((order) => {
      const method: "pickup" | "delivery" =
        order.fulfillmentMethod === "delivery" ? "delivery" : "pickup";
      return { order, method, siteId: method === "pickup" ? siteIdOf(order.pickupAddress) : null };
    });
    const departureId = resolved.some((entry) => entry.method === "delivery")
      ? await this.departure.currentSiteId()
      : null;
    const sites = await this.sitesOf([
      ...resolved.flatMap((entry) => (entry.siteId === null ? [] : [entry.siteId])),
      ...(departureId === null ? [] : [departureId]),
    ]);
    return new Map(
      resolved.flatMap(({ order, method, siteId }) => {
        const site = (method === "pickup" ? siteId : departureId) ?? null;
        const color = orderCategoryColor(
          method,
          order.clientele,
          site === null ? null : (sites.get(site) ?? null),
        );
        return color === null ? [] : [[order.id, color] as const];
      }),
    );
  }

  /** Les sites archivés se résolvent aussi, comme pour le bon. */
  private async sitesOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, SiteColorSet>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.site.findMany({
      where: { id: { in: [...new Set(siteIds)] } },
      select: COLORS_SELECT,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }
}
