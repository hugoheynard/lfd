import { vatSharesSchema } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type {
  FrozenInvoiceLine,
  FrozenInvoiceOrder,
  FrozenOrderVatShare,
} from "../domain/services/invoice-dossier.types.js";
import {
  FROZEN_INVOICE_ORDER_SELECT,
  toFrozenInvoiceOrder,
} from "./frozen-invoice-order.mapper.js";

/** Le statut d'un bon de livraison remis (`delivery_note.status`). */
const HANDED_OVER = "handed_over";

/**
 * Une commande DÉCIDÉE (départ incomplet) lue sans ses montants facturables :
 * ses BL remis ne disent pas encore ce qu'elle doit. Les assiettes l'écartent
 * (`billable_total_cents` posé) ; l'atteindre veut dire qu'une lecture a
 * perdu son critère.
 */
export class UnsettledPartialOrderError extends TechnicalError {
  constructor(reference: string) {
    super(
      "accounting.billable_order.unsettled_partial",
      `La commande ${reference} est un départ incomplet dont le solde n'est pas posé : ses montants ` +
        "facturables manquent, et la facture ne peut pas la porter. Lancez le rapprochement des bons de " +
        "livraison ; si l'écart reste, signalez-le à l'équipe technique.",
    );
  }
}

/**
 * Ce qu'un bon au compte doit **réellement** (lot E6c2, plan
 * plan E6c2 (`documentation/commandes/bon-de-livraison.md`)
 * § 0 et § 4) — la couture que lisent la facture du mois, le relevé, le
 * dossier et la constitution d'un lot. La facture CARTE n'en dépend pas : elle
 * part à la remise, avant tout solde, et garde {@link toFrozenInvoiceOrder}.
 */
export const BILLABLE_INVOICE_ORDER_SELECT = {
  ...FROZEN_INVOICE_ORDER_SELECT,
  billableDiscountCents: true,
  billableVoucherDiscountCents: true,
  billableDeliveryFeeCents: true,
  billableLateFeeCents: true,
  billableVatCents: true,
  billableVatShares: true,
  billableTotalCents: true,
  shortfallDecision: { select: { id: true } },
  deliveryNotes: {
    where: { status: HANDED_OVER },
    orderBy: { rank: "asc" },
    select: {
      number: true,
      serviceDay: true,
      lines: {
        // Une ligne livrée à zéro n'est pas facturée (§ 4).
        where: { quantity: { gt: 0 } },
        orderBy: { id: "asc" },
        select: {
          sku: true,
          productName: true,
          unitPriceMillicents: true,
          vatRate: true,
          quantity: true,
          lineTotalCents: true,
          pickupDiscountEligible: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export type BillableInvoiceOrderRow = Prisma.OrderGetPayload<{
  select: typeof BILLABLE_INVOICE_ORDER_SELECT;
}>;

type NoteRow = BillableInvoiceOrderRow["deliveryNotes"][number];
type NoteLineRow = NoteRow["lines"][number];

/** `AAAA-MM-JJ`. */
const DAY_LENGTH = 10;

/**
 * La ligne Prisma d'un bon au compte → les entrées du simulateur, sur ce qui
 * est **parti** : la règle du solde (`OrderBilling`), transposée.
 *
 * - **Totaux** : les montants facturables (`billable_*`). Non posés sur une
 *   commande sans décision — un bon facturé avant E6c2 que le rapprochement
 *   n'aurait pas encore soldé —, la recopie des totaux de la commande, qui
 *   est exactement ce que le solde y poserait.
 * - **Lignes** : celles des BL remis, par rang puis par ligne, pour une
 *   commande décidée ou remise en plusieurs envois (plan E7 reliquat, L5b —
 *   la règle de `OrderBilling`) ; celles de la commande sinon — un BL complet est leur
 *   recopie (invariant 3 du plan-cadre des BL), et un bon d'avant les BL n'en
 *   a pas.
 *
 * @throws {UnsettledPartialOrderError} une commande décidée sans montants facturables.
 */
export function toBillableInvoiceOrder(row: BillableInvoiceOrderRow): FrozenInvoiceOrder {
  const ordered = toFrozenInvoiceOrder(row);
  const partial = row.shortfallDecision !== null;
  const fromNotes = partial || row.deliveryNotes.length > 1;
  if (row.billableTotalCents === null) {
    if (partial) {
      throw new UnsettledPartialOrderError(row.orderNumber);
    }
    return ordered;
  }
  // CHECK « tout ou rien » (migration `20261025140100`) : un total posé porte
  // les six autres ; le repli ne sert qu'au typage.
  return {
    ...ordered,
    lines: fromNotes ? row.deliveryNotes.flatMap(noteLinesOf) : ordered.lines,
    discountCents: row.billableDiscountCents ?? ordered.discountCents,
    voucherDiscountCents: row.billableVoucherDiscountCents ?? ordered.voucherDiscountCents,
    deliveryFeeCents: row.billableDeliveryFeeCents ?? ordered.deliveryFeeCents,
    lateFeeCents: row.billableLateFeeCents ?? ordered.lateFeeCents,
    vatShares: parseVatShares(row.billableVatShares),
    vatCents: row.billableVatCents ?? ordered.vatCents,
    totalCents: row.billableTotalCents,
  };
}

/** Les numéros des BL remis, par rang — ce que cite la ligne de référence de la facture. */
export function handedOverNoteNumbersOf(row: {
  readonly deliveryNotes: readonly { readonly number: string }[];
}): readonly string[] {
  return row.deliveryNotes.map((note) => note.number);
}

/** Les lignes d'un BL remis ; celles d'un reste portent son jour (`service_day`, nul au rang 1). */
function noteLinesOf(note: NoteRow): readonly FrozenInvoiceLine[] {
  const day = note.serviceDay?.toISOString().slice(0, DAY_LENGTH);
  return note.lines.map((line) => ({
    ...noteLineOf(line),
    ...(day === undefined ? {} : { deliveryDate: day }),
  }));
}

function noteLineOf(line: NoteLineRow): FrozenInvoiceLine {
  return {
    sku: line.sku,
    productNameSnapshot: line.productName,
    unitPriceMillicents: line.unitPriceMillicents,
    // Lu tel quel (« 5.50 ») : le domaine normalise, jamais l'adaptateur.
    vatRate: line.vatRate.toString(),
    quantity: line.quantity,
    lineTotalCents: line.lineTotalCents,
    // `NULL` sur un BL d'avant E4a : absent, c'est-à-dire éligible.
    ...(line.pickupDiscountEligible === null
      ? {}
      : { pickupDiscountEligible: line.pickupDiscountEligible }),
  };
}

/** Comme pour la commande : validé, pas casté ; `null` envoie la TVA en « non ventilée ». */
function parseVatShares(value: Prisma.JsonValue | null): readonly FrozenOrderVatShare[] | null {
  const parsed = vatSharesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
