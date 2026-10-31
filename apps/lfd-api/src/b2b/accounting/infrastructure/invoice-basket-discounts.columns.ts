import { cartAdjustmentSchema } from "@lfd/contracts";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import {
  frozenBasketDiscountsOf,
  type FrozenBasketDiscount,
} from "../../orders/domain/services/frozen-basket-discounts.js";
import type {
  FrozenInvoiceDiscount,
  FrozenInvoiceDiscountPart,
} from "../domain/services/invoice-dossier.types.js";

/**
 * **Les remises de panier d'un bon, relues pour sa facture** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.4 et rectification du 2026-10-31, lot M5.
 *
 * La liste passe par le repli UNIQUE du domaine des commandes
 * ({@link frozenBasketDiscountsOf}) : `order_discounts` si la commande y a
 * des remises actives, sinon ses colonnes `discount_*` comme une remise de
 * rang 1. Une commande non reprise n'a donc jamais « zéro remise » ici.
 *
 * Rien n'y est refusé : un ajustement ou des parts illisibles rendent des
 * parts `null`, et le bon se découpe alors comme avant M5, sur le total de sa
 * remise. Une facture ne s'arrête pas sur un détail qu'elle sait remplacer.
 */

/** Les remises actives, dans l'ordre d'application. */
export const INVOICE_ORDER_DISCOUNTS_SELECT = {
  where: { archivedAt: null },
  orderBy: { rank: "asc" },
  select: { id: true, promotionId: true, adjustment: true, label: true, vatShares: true },
} as const satisfies Prisma.Order$discountsArgs;

/** Les parts d'un bon de livraison, par remise de commande. */
export const INVOICE_NOTE_DISCOUNTS_SELECT = {
  select: { orderDiscountId: true, vatShares: true },
} as const satisfies Prisma.DeliveryNote$discountsArgs;

interface OrderDiscountRow {
  readonly id: string;
  readonly promotionId: string | null;
  readonly adjustment: Prisma.JsonValue | null;
  readonly label: Prisma.JsonValue | null;
  readonly vatShares: Prisma.JsonValue;
}

/** Ce que la commande porte pour se lire avec son repli. */
export interface InvoiceDiscountColumnsRow {
  readonly discountPromotionId: string | null;
  readonly discountAdjustment: Prisma.JsonValue | null;
  readonly discountLabel: Prisma.JsonValue | null;
  readonly discounts: readonly OrderDiscountRow[];
}

/** Une part d'un bon de livraison, telle que lue. */
export interface NoteDiscountRow {
  readonly orderDiscountId: string;
  readonly vatShares: Prisma.JsonValue;
}

/**
 * Les remises de la commande, leurs parts lues dans `order_discounts` — ou,
 * quand des bons remis en portent, la somme de leurs parts
 * (`delivery_note_discounts`) : ce qui est facturé est ce qui est parti.
 */
export function invoiceBasketDiscountsOf(
  row: InvoiceDiscountColumnsRow,
  noteParts: readonly NoteDiscountRow[] = [],
): readonly FrozenInvoiceDiscount[] {
  const shares = new Map(row.discounts.map((d) => [d.id, discountSharesOf(d.vatShares)]));
  const fromNotes = noteParts.length > 0 ? sharesByDiscount(noteParts) : null;
  const discounts = frozenBasketDiscountsOf(row.discounts.map(activeDiscountOf), {
    discountPromotionId: row.discountPromotionId,
    discountAdjustment: adjustmentOf(row.discountAdjustment),
  });
  return discounts.map((discount) => {
    const id = discount.orderDiscountId;
    const parts =
      id === null ? null : fromNotes === null ? (shares.get(id) ?? null) : partsOf(fromNotes, id);
    return {
      promotionId: discount.promotionId,
      label: id === null ? frenchLabelOf(row.discountLabel) : discount.label,
      parts,
    };
  });
}

function activeDiscountOf(row: OrderDiscountRow): FrozenBasketDiscount {
  return {
    orderDiscountId: row.id,
    promotionId: row.promotionId,
    adjustment: adjustmentOf(row.adjustment),
    label: frenchLabelOf(row.label),
    // La facture ne relit pas la couverture : les parts figées la portent déjà.
    coveredSkus: null,
  };
}

/** Une remise sans part sur aucun bon remis (un fixe compté au BL-1) n'a rien à facturer ici. */
function partsOf(
  fromNotes: ReadonlyMap<string, FrozenInvoiceDiscountPart[] | null>,
  id: string,
): readonly FrozenInvoiceDiscountPart[] | null {
  return fromNotes.has(id) ? (fromNotes.get(id) ?? null) : [];
}

function sharesByDiscount(
  noteParts: readonly NoteDiscountRow[],
): ReadonlyMap<string, FrozenInvoiceDiscountPart[] | null> {
  const byDiscount = new Map<string, FrozenInvoiceDiscountPart[] | null>();
  for (const part of noteParts) {
    const known = byDiscount.get(part.orderDiscountId);
    const read = discountSharesOf(part.vatShares);
    byDiscount.set(
      part.orderDiscountId,
      known === null || read === null ? null : [...(known ?? []), ...read],
    );
  }
  return byDiscount;
}

const discountSharesSchema = z.array(z.object({ rate: z.number(), htCents: z.number().int() }));

/** Les parts HT par taux ; illisibles = `null`. */
function discountSharesOf(value: Prisma.JsonValue): FrozenInvoiceDiscountPart[] | null {
  const parsed = discountSharesSchema.safeParse(value);
  return parsed.success
    ? parsed.data.map((share) => ({ rate: share.rate, amountCents: share.htCents }))
    : null;
}

const frozenLabelSchema = z.object({ fr: z.string() });

/** Le libellé figé, en français ; une forme inattendue se tait. */
function frenchLabelOf(value: Prisma.JsonValue | null): string | null {
  const parsed = frozenLabelSchema.safeParse(value);
  return parsed.success ? parsed.data.fr : null;
}

/** L'ajustement ne sert ici qu'à dire « une remise existe » au repli. */
function adjustmentOf(value: Prisma.JsonValue | null): FrozenBasketDiscount["adjustment"] {
  const parsed = cartAdjustmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
