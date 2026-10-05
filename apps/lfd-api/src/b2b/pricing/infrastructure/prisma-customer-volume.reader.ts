import { Injectable } from "@nestjs/common";

import { CompanyFollowAspect, OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CustomerVolumeReader } from "../domain/ports/customer-volume.reader.js";
import type { VolumeWindow } from "../domain/ports/sku-volume.reader.js";

/**
 * Les statuts qui **comptent** dans le cumul d'un engagement.
 *
 * Les mêmes que le volume de marché, et pour la même raison : une commande
 * annulée n'a rien commandé, un brouillon n'a pas été passé. Une commande
 * `placed` non encore payée compte — l'engagement porte sur ce qui est commandé,
 * pas sur ce qui est encaissé, et l'indexer sur le règlement ferait dépendre un
 * palier du délai de paiement.
 */
const COUNTED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.placed,
  OrderStatus.confirmed,
  OrderStatus.in_production,
  OrderStatus.fulfilled,
];

@Injectable()
export class PrismaCustomerVolumeReader extends CustomerVolumeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Un `groupBy` par SKU borné par le client ET la fenêtre — une requête quel
   * que soit le nombre d'articles du panier.
   *
   * La date lue est celle de la **commande**, comme partout ailleurs dans ce
   * contexte : c'est l'instant où le prix a été résolu, donc le seul qui
   * s'aligne sur la période de l'engagement qu'on évalue.
   *
   */
  volumesFor(
    companyId: string,
    skus: readonly string[],
    window: VolumeWindow,
  ): Promise<ReadonlyMap<string, number>> {
    return this.sumOver(companyId, skus, window, []);
  }

  /**
   * 🔴 **Les sous-comptes qui suivaient son tarif comptent avec lui** (Q6 du
   * plan `plan-sous-comptes.md`, défaut validé par Hugo le 2026-10-05) : le
   * Club Med a négocié pour trois établissements, et leurs commandes font
   * avancer ensemble le palier. Chaque commande d'un sous-compte n'entre que si
   * sa date tombe dans une période de suivi `pricing` vers ce compte : un
   * établissement sorti garde ses commandes passées, pas les suivantes (R5).
   */
  async committedVolumesFor(
    companyId: string,
    skus: readonly string[],
    window: VolumeWindow,
  ): Promise<ReadonlyMap<string, number>> {
    if (skus.length === 0) {
      return new Map();
    }
    return this.sumOver(companyId, skus, window, await this.followersOver(companyId, window));
  }

  private async sumOver(
    companyId: string,
    skus: readonly string[],
    window: VolumeWindow,
    followers: readonly { companyId: string; from: Date; to: Date }[],
  ): Promise<ReadonlyMap<string, number>> {
    if (skus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderLine.groupBy({
      by: ["sku"],
      where: {
        sku: { in: [...skus] },
        order: {
          status: { in: [...COUNTED_STATUSES] },
          OR: [
            { companyId, createdAt: { gte: window.from, lt: window.to } },
            ...followers.map((period) => ({
              companyId: period.companyId,
              createdAt: { gte: period.from, lt: period.to },
            })),
          ],
        },
      },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.sku, row._sum.quantity ?? 0]));
  }

  /**
   * Les périodes de suivi `pricing` vers ce compte, **rognées à la fenêtre** :
   * début inclus, fin exclue, comme la contrainte d'exclusion de
   * `company_follows`. Une période qui ne touche pas la fenêtre n'en sort pas.
   */
  private async followersOver(
    parentId: string,
    window: VolumeWindow,
  ): Promise<readonly { companyId: string; from: Date; to: Date }[]> {
    const periods = await this.prisma.companyFollow.findMany({
      where: {
        parentId,
        aspect: CompanyFollowAspect.pricing,
        validFrom: { lt: window.to },
        OR: [{ validTo: null }, { validTo: { gt: window.from } }],
      },
      select: { companyId: true, validFrom: true, validTo: true },
    });
    return periods.map((period) => ({
      companyId: period.companyId,
      from: latest(period.validFrom, window.from),
      to: period.validTo === null ? window.to : earliest(period.validTo, window.to),
    }));
  }
}

function latest(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function earliest(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}
