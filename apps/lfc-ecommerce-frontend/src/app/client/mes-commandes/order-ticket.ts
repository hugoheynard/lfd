import type {
  CustomerOrderView,
  DiscountLabelView,
  OrderRateAmounts,
  OrderSaleUnit,
} from '@lfd/contracts';

/**
 * **Le ticket d'une commande composée en TTC** — celle d'un particulier (plan
 * `documentation/pricing/centime-et-tva/plan-centime-particuliers.md`, lot C3). Ses lignes à
 * leur TTC scellé (quantité × étiquette), la remise, le bon et le port à leur
 * TTC figé, le total payé, puis HT / TVA / TTC de chaque taux tels que la
 * commande les a figés (`ttc_by_rate`). Tout est LU : aucune TVA ne se calcule
 * au front.
 *
 * `null` pour toute autre commande — un pro, ou une commande d'avant la
 * colonne : l'écran garde alors son affichage.
 */
export interface OrderTicket {
  readonly lines: readonly OrderTicketLine[];
  /** Σ des lignes TTC. */
  readonly articlesCents: number;
  readonly discountCents: number;
  /**
   * Une entrée par remise, à son TTC figé, quand la commande en porte
   * PLUSIEURS (plan des promotions, § 18.6, lot M6) — absente sinon : la
   * ligne de remise d'hier, au caractère près. Leur somme est `discountCents`.
   */
  readonly discounts?: readonly OrderTicketDiscount[];
  readonly voucherCents: number;
  readonly deliveryFeeCents: number;
  /** Le total payé : `articles − remise − bon + port`. */
  readonly totalCents: number;
  readonly byRate: readonly OrderRateAmounts[];
}

/** Une remise du ticket : son libellé figé (absent : le mot de l'écran), son TTC. */
export interface OrderTicketDiscount {
  readonly label?: DiscountLabelView;
  readonly ttcCents: number;
}

export interface OrderTicketLine {
  readonly name: string;
  readonly quantity: number;
  /** `weight` : la quantité est en grammes et l'étiquette au kilo (P4). */
  readonly saleUnit: OrderSaleUnit;
  readonly unitTtcCents: number;
  readonly lineTtcCents: number;
}

export function ticketOf(order: CustomerOrderView): OrderTicket | null {
  const { ttcTerms, ttcByRate } = order;
  if (ttcTerms === undefined || ttcByRate === undefined) {
    return null;
  }
  const lines: OrderTicketLine[] = [];
  for (const line of order.lines) {
    const unit = line.unitPriceTtcCents ?? null;
    const total = line.lineTotalTtcCents ?? null;
    if (unit === null || total === null) {
      return null;
    }
    lines.push({
      name: line.productName,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
      unitTtcCents: unit,
      lineTtcCents: total,
    });
  }
  return {
    lines,
    articlesCents: lines.reduce((sum, line) => sum + line.lineTtcCents, 0),
    discountCents: ttcTerms.discountCents,
    ...ticketDiscountsOf(order),
    voucherCents: ttcTerms.voucherCents,
    deliveryFeeCents: ttcTerms.deliveryFeeCents,
    totalCents: order.totalCents,
    byRate: ttcByRate,
  };
}

/**
 * Les remises du ticket, une par une — seulement s'il y en a plusieurs et
 * que chacune porte son TTC figé ; sinon rien, et le ticket garde sa ligne.
 */
function ticketDiscountsOf(order: CustomerOrderView): {
  readonly discounts?: readonly OrderTicketDiscount[];
} {
  const discounts = order.discounts;
  if (discounts === undefined || discounts.length < 2) {
    return {};
  }
  const lines: OrderTicketDiscount[] = [];
  for (const discount of discounts) {
    if (discount.amountTtcCents === null) {
      return {};
    }
    lines.push({
      ...(discount.label === undefined ? {} : { label: discount.label }),
      ttcCents: discount.amountTtcCents,
    });
  }
  return { discounts: lines };
}
