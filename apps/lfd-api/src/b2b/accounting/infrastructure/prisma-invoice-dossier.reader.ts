import {
  billingAddressPayloadSchema,
  lateFeeAdjustmentSchema,
  vatSharesSchema,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  InvoiceDossierReader,
  type InvoiceDossierOrder,
} from "../domain/ports/invoice-dossier.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import type {
  DossierOrderPlace,
  FrozenDeliveryVatMode,
  FrozenOrderVatShare,
} from "../domain/services/invoice-dossier.types.js";
import { billableOrderWhere } from "./billable-order-criterion.js";

/** Le jour `AAAA-MM-JJ` d'une colonne `@db.Date`, lue à minuit UTC. */
const ISO_DAY_LENGTH = 10;

/**
 * Les bons d'un dossier de facturation, par le **même critère** que le relevé
 * et l'assiette du prélèvement (`billableOrderWhere`), et le même filtre de
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
    const rows = await this.prisma.order.findMany({
      where: {
        ...billableOrderWhere(cycle.startsAt, cycle.closesAt),
        OR: [{ companyId: { in: [...companyIds] } }, { billedCompanyId: { in: [...companyIds] } }],
      },
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: DOSSIER_ORDER_SELECT,
    });
    return rows.map(toDossierOrder);
  }
}

const DOSSIER_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  fulfillmentMethod: true,
  pickupAddress: true,
  deliveryAddressSnapshot: true,
  createdAt: true,
  companyId: true,
  billedCompanyId: true,
  requestedDeliveryDate: true,
  discountCents: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  deliveryVatMode: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
  vatShares: true,
  vatCents: true,
  totalCents: true,
  lines: {
    orderBy: { id: "asc" },
    select: {
      sku: true,
      productNameSnapshot: true,
      unitPriceMillicents: true,
      vatRate: true,
      quantity: true,
      lineTotalCents: true,
    },
  },
} satisfies Prisma.OrderSelect;

type DossierOrderRow = Prisma.OrderGetPayload<{ select: typeof DOSSIER_ORDER_SELECT }>;

function toDossierOrder(row: DossierOrderRow): InvoiceDossierOrder {
  return {
    orderId: row.id,
    place: placeOf(row),
    // Jamais vide : `billableOrderWhere` exige une société.
    companyId: row.companyId ?? "",
    billedCompanyId: row.billedCompanyId,
    order: {
      reference: row.orderNumber,
      createdAt: row.createdAt,
      requestedDeliveryDate:
        row.requestedDeliveryDate?.toISOString().slice(0, ISO_DAY_LENGTH) ?? null,
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productNameSnapshot: line.productNameSnapshot,
        unitPriceMillicents: line.unitPriceMillicents,
        // Lu tel quel (« 5.50 ») : le domaine normalise, jamais l'adaptateur.
        vatRate: line.vatRate.toString(),
        quantity: line.quantity,
        lineTotalCents: line.lineTotalCents,
      })),
      discountCents: row.discountCents,
      voucherDiscountCents: row.voucherDiscountCents,
      deliveryFeeCents: row.deliveryFeeCents,
      deliveryVatMode: parseDeliveryVatMode(row.deliveryVatMode),
      lateFeeCents: row.lateFeeCents,
      lateFeeVatRate: parseLateFeeVatRate(row.lateFeeAdjustment),
      vatShares: parseVatShares(row.vatShares),
      vatCents: row.vatCents,
      totalCents: row.totalCents,
    },
  };
}

/**
 * Tenu par un CHECK en base ; une autre valeur se lit comme `null` — taux
 * normal, ce que facturait tout bon d'avant le réglage.
 */
function parseDeliveryVatMode(value: string | null): FrozenDeliveryVatMode | null {
  return value === "standard" || value === "follows_goods" ? value : null;
}

/** Absent ou illisible : `null`, et le domaine arrête le dossier si le bon porte une surtaxe. */
function parseLateFeeVatRate(value: Prisma.JsonValue | null): number | null {
  const parsed = lateFeeAdjustmentSchema.safeParse(value);
  return parsed.success ? parsed.data.vatRatePercent : null;
}

/** Comme au relevé : validé, pas casté ; `null` envoie la TVA du bon en « non ventilée ». */
function parseVatShares(value: Prisma.JsonValue | null): readonly FrozenOrderVatShare[] | null {
  const parsed = vatSharesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
