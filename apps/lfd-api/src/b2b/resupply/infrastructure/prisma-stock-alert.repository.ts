import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StockAlert } from "../domain/stock-alert.js";
import {
  StockAlertChangedMeanwhileError,
  StockAlertDeclaredMeanwhileError,
} from "../domain/stock-alert-errors.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { stockAlertSnapshotOf } from "./stock-alert.row.js";

/** Les colonnes d'une alerte que chaque geste réécrit. */
function columnsOf(alert: StockAlert) {
  return {
    level: alert.level,
    declaredAt: alert.declared.at,
    declaredByStaffId: alert.declared.author.staffUserId,
    declaredByName: alert.declared.author.name,
    declaredByRole: alert.declared.author.role,
    liftedAt: alert.lifted?.at ?? null,
    liftedByStaffId: alert.lifted?.author.staffUserId ?? null,
    liftedByName: alert.lifted?.author.name ?? null,
    liftedByRole: alert.lifted?.author.role ?? null,
    liftReason: alert.lifted?.reason ?? null,
  };
}

type AlertColumns = ReturnType<typeof columnsOf>;

/**
 * Adaptateur Prisma des alertes de stock (`site_stock_alert`). Une alerte
 * neuve s'insère — l'index unique partiel refuse une seconde alerte vivante
 * pour le même (point, article), en 409 nommé
 * (`StockAlertDeclaredMeanwhileError`) ; ensuite elle se réécrit sous le
 * verrou de la version lue. Rien ne se supprime : une alerte levée reste.
 */
@Injectable()
export class PrismaStockAlertRepository extends StockAlertRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(siteId: string, alertId: string): Promise<StockAlert | null> {
    // Le point est dans le `where` : c'est le mur par point.
    const row = await this.prisma.siteStockAlert.findFirst({ where: { id: alertId, siteId } });
    return row === null ? null : StockAlert.restore(stockAlertSnapshotOf(row));
  }

  async liveFor(siteId: string, sku: string): Promise<StockAlert | null> {
    const row = await this.prisma.siteStockAlert.findFirst({
      where: { siteId, sku, liftedAt: null },
    });
    return row === null ? null : StockAlert.restore(stockAlertSnapshotOf(row));
  }

  async liveForSkus(siteId: string, skus: readonly string[]): Promise<readonly StockAlert[]> {
    const rows = await this.prisma.siteStockAlert.findMany({
      where: { siteId, sku: { in: [...skus] }, liftedAt: null },
      orderBy: { sku: "asc" },
    });
    return rows.map((row) => StockAlert.restore(stockAlertSnapshotOf(row)));
  }

  async save(alert: StockAlert): Promise<void> {
    const data = columnsOf(alert);
    if (alert.version === 0) {
      await this.create(alert, data);
      return;
    }
    const { count } = await this.prisma.siteStockAlert.updateMany({
      where: { id: alert.id, siteId: alert.siteId, version: alert.version },
      data: { version: alert.version + 1, ...data },
    });
    if (count === 0) {
      throw new StockAlertChangedMeanwhileError();
    }
  }

  private async create(alert: StockAlert, data: AlertColumns): Promise<void> {
    try {
      await this.prisma.siteStockAlert.create({
        data: { id: alert.id, siteId: alert.siteId, sku: alert.sku, label: alert.label, ...data },
      });
    } catch (error) {
      // L'index de l'alerte vivante : un autre poste vient d'en déclarer une
      // pour cet article, entre la lecture de `liveFor` et cette écriture.
      if (isUniqueViolation(error)) {
        throw new StockAlertDeclaredMeanwhileError();
      }
      throw error;
    }
  }
}
