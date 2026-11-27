import { exposedHandoverToken } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PostDeployOperation,
  type OperationReport,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import { OrderSheetArchive } from "../application/services/order-sheet-archive.service.js";
import { OrderReader } from "../domain/ports/order.reader.js";
import { clientSheetOf } from "../domain/services/order-sheet.js";

/** La clé stable de l'opération. */
export const ORD_35_SHEET_OPERATION_KEY = "orders.ord-35-sheet";

/** La commande visée : reprise en commande interne après sa passation. */
const ORD_35 = "ORD-35";

/**
 * **Refaire la confirmation rangée d'une commande reprise** — sa copie gardée
 * au stockage a été fabriquée à la passation, quand la commande était encore
 * au compte, et porte donc ses prix. Une commande interne n'en montre aucun
 * (`documentation/comptabilite/facturation/restaurants-maison.md`, § 2).
 *
 * Séparée de l'opération pour que le test vise sa propre commande.
 */
export class OrderSheetRefresh {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderReader,
    private readonly archive: OrderSheetArchive,
    private readonly orderNumber: string,
  ) {}

  /** Pourquoi rien n'est à refaire ; `null` : la copie rangée est à refaire. */
  async refusal(): Promise<string | null> {
    const target = await this.target();
    if (target === null) {
      return `La commande ${this.orderNumber} n'existe pas.`;
    }
    const state = await this.archive.archiveState(target.sheet, target.token);
    if (state === "absent") {
      return `Aucune confirmation de ${this.orderNumber} n'est rangée : le prochain téléchargement la fabriquera d'après la commande.`;
    }
    return state === "stale"
      ? null
      : `La confirmation rangée de ${this.orderNumber} dit déjà ce que dit la commande.`;
  }

  /** Refait la copie rangée si elle est à refaire ; rend `true` si elle a écrit. */
  async apply(): Promise<boolean> {
    if ((await this.refusal()) !== null) {
      return false;
    }
    const target = await this.target();
    if (target === null) {
      return false;
    }
    await this.archive.replaceArchive(target.sheet, target.token);
    return true;
  }

  private async target() {
    const row = await this.prisma.order.findUnique({
      where: { orderNumber: this.orderNumber },
      select: { id: true },
    });
    const owned = row === null ? null : await this.orders.findById(row.id);
    if (owned === null) {
      return null;
    }
    return {
      sheet: clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone, owned.revision),
      token: exposedHandoverToken(owned.view),
    };
  }
}

/**
 * ORD-35, passée en commande interne après coup : sa confirmation rangée,
 * jointe à l'e-mail de passation, porte encore les prix. L'opération la refait
 * d'après la commande telle qu'elle est.
 */
@Injectable()
export class Ord35SheetOperation extends PostDeployOperation {
  readonly key = ORD_35_SHEET_OPERATION_KEY;
  readonly title = "Refaire la confirmation d'ORD-35, sans prix";
  readonly why =
    "ORD-35 a été passée au compte puis reprise en commande interne. Sa confirmation de commande, rangée à la passation, montre encore les prix ; le téléchargement relit cette copie.";
  readonly limit =
    "L'e-mail de confirmation déjà envoyé garde sa pièce jointe chiffrée : il ne peut pas être rappelé.";
  readonly after: readonly string[] = [];

  private readonly refresh: OrderSheetRefresh;

  constructor(prisma: PrismaService, orders: OrderReader, archive: OrderSheetArchive) {
    super();
    this.refresh = new OrderSheetRefresh(prisma, orders, archive, ORD_35);
  }

  async simulate(): Promise<OperationReport> {
    const refusal = await this.refresh.refusal();
    return refusal === null
      ? reportOf(1, "1 confirmation à refaire sans prix.")
      : reportOf(0, refusal);
  }

  async apply(): Promise<OperationReport> {
    return (await this.refresh.apply())
      ? reportOf(1, "1 confirmation refaite sans prix.")
      : reportOf(0, "Rien à refaire.");
  }
}

function reportOf(writable: number, sentence: string): OperationReport {
  return {
    writable,
    byHand: 0,
    summary: [sentence],
    sample: writable > 0 ? [ORD_35] : [],
  };
}
