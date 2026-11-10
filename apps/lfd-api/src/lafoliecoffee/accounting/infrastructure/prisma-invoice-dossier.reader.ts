import { billingAddressPayloadSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  InvoiceDossierReader,
  type InvoiceDossierOrder,
} from "../domain/ports/invoice-dossier.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import type { DossierOrderPlace } from "../domain/services/invoice-dossier.types.js";
import {
  cycleOrderMembership,
  cycleOrderWhere,
  isCancelledAfterInvoicing,
} from "./cycle-order-membership.js";
import {
  BILLABLE_INVOICE_ORDER_SELECT,
  toBillableInvoiceOrder,
} from "./billable-invoice-order.mapper.js";

/**
 * Les bons d'un dossier de facturation, par la **même appartenance** que le
 * relevé (`cycleOrderMembership` : ceux que la facture du cycle porte ou portera), et
 * le même filtre de
 * sociétés que `PrismaCycleOrdersReader`.
 *
 * 🔴 `company_id` (ou le payeur copié) est dans le `where` : le dossier ne lit
 * jamais une autre société que celles demandées.
 */
@Injectable()
export class PrismaInvoiceDossierReader extends InvoiceDossierReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dossierCompanyName(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { raisonSociale: true },
    });
    return company?.raisonSociale ?? null;
  }

  async dossierOrders(
    companyIds: readonly string[],
    cycle: BillingCycle,
  ): Promise<readonly InvoiceDossierOrder[]> {
    const membership = await cycleOrderMembership(this.prisma, companyIds, cycle);
    const rows = await this.prisma.order.findMany({
      // Les commandes de ces sociétés, ET celles qu'elles paient (le payeur
      // copié, S4) : un site détaché depuis reste sur le relevé de qui l'a
      // réglé. Le tri par payeur est fait par le domaine (`billedPayerOf`).
      // Un bon facturé reste lu même annulé depuis (`cycleOrderWhere`).
      where: cycleOrderWhere(companyIds, membership),
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: DOSSIER_ORDER_SELECT,
    });
    return rows.map((row) =>
      toDossierOrder(row, isCancelledAfterInvoicing(membership, row.id, row.status)),
    );
  }
}

const DOSSIER_ORDER_SELECT = {
  ...BILLABLE_INVOICE_ORDER_SELECT,
  id: true,
  fulfillmentMethod: true,
  pickupAddress: true,
  deliveryAddressSnapshot: true,
  companyId: true,
  billedCompanyId: true,
  status: true,
} satisfies Prisma.OrderSelect;

type DossierOrderRow = Prisma.OrderGetPayload<{ select: typeof DOSSIER_ORDER_SELECT }>;

function toDossierOrder(
  row: DossierOrderRow,
  cancelledAfterInvoicing: boolean,
): InvoiceDossierOrder {
  return {
    orderId: row.id,
    cancelledAfterInvoicing,
    place: placeOf(row),
    // Jamais vide : `accountOrderWhere` exige une société, et un bon facturé l'a passé.
    companyId: row.companyId ?? "",
    billedCompanyId: row.billedCompanyId,
    order: toBillableInvoiceOrder(row),
  };
}

/**
 * Le lieu figé du bon : le snapshot du point de retrait, ou l'adresse libre
 * livrée. Lu avec indulgence — un snapshot illisible rend un lieu sans
 * adresse, le dossier ne s'arrête pas pour un libellé.
 */
function placeOf(row: DossierOrderRow): DossierOrderPlace {
  const method = row.fulfillmentMethod === "pickup" ? "pickup" : "delivery";
  const parsed = billingAddressPayloadSchema.safeParse(
    method === "pickup" ? row.pickupAddress : row.deliveryAddressSnapshot,
  );
  if (!parsed.success) {
    return { method, label: null, address: null };
  }
  const address = parsed.data;
  return {
    method,
    label: address.label === "" ? null : address.label,
    address: [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`]
      .filter((part) => part !== "")
      .join(", "),
  };
}
