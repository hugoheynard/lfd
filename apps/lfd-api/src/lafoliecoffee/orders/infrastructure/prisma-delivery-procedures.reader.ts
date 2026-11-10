import { Injectable } from "@nestjs/common";

import {
  type DeliveryOrderProcedure,
  DeliveryProceduresReader,
  type DeliveryProcedureStep,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { photoCardRevision } from "../../shared/photo-cards/domain/value-objects/photo-revision.js";
import { RUN_SHEET_PROCEDURE_SELECT, type AddressLink } from "./delivery-run-sheet.query.js";

/**
 * **La procédure de livraison, servie au livreur** — l'adaptateur de
 * `DeliveryProceduresReader` (plan « Ma tournée », MT-D5 v2).
 *
 * Mêmes lectures que la feuille de route (`PrismaDeliveryRunSheetReader`) :
 * le lien d'adresse de la commande, puis la procédure SOUS LE MUR — chaque
 * couple `(adresse, société)` entre dans le `where`, et le mapper revérifie
 * la société. Deux lectures quel que soit le nombre de commandes. La clé de
 * photo ne sort pas : sa présence et sa révision seulement.
 */
@Injectable()
export class PrismaDeliveryProceduresReader extends DeliveryProceduresReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async proceduresOf(orderIds: readonly string[]): Promise<readonly DeliveryOrderProcedure[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const orders = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: { id: true, companyId: true, deliveryAddressId: true },
    });
    const links = orders.flatMap((row): AddressLink[] =>
      row.deliveryAddressId === null || row.companyId === null
        ? []
        : [{ addressId: row.deliveryAddressId, companyId: row.companyId }],
    );
    if (links.length === 0) {
      return [];
    }
    const procedures = await this.prisma.deliveryProcedure.findMany({
      where: {
        OR: links.map((link) => ({ addressId: link.addressId, companyId: link.companyId })),
      },
      select: { ...RUN_SHEET_PROCEDURE_SELECT, companyId: true },
    });
    return orders.flatMap((order) => {
      const procedure = procedures.find(
        (row) => row.addressId === order.deliveryAddressId && row.companyId === order.companyId,
      );
      return procedure === undefined
        ? []
        : [{ orderId: order.id, steps: procedure.steps.map(toStep) }];
    });
  }
}

function toStep(step: {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly photoKey: string | null;
}): DeliveryProcedureStep {
  return {
    id: step.id,
    title: step.title,
    body: step.body,
    hasPhoto: step.photoKey !== null,
    photoRevision: step.photoKey === null ? null : photoCardRevision(step.photoKey),
  };
}
