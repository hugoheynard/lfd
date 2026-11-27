import type {
  CustomerOrderView,
  DiscountLabelView,
  OrderRateAmounts,
  OrderLineOptionChoiceView,
  OrderSaleUnit,
} from '@lfd/contracts';

/**
 * **Le ticket d'une commande composée en TTC** — celle d'un particulier (plan
 * `documentation/pricing/centime-et-tva/le-ttc-fait-foi.md`, lot C3). Ses lignes à
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
  /**
   * Le nom figé de la remise UNIQUE, quand une promotion la fait (décision
   * du 2026-11-01) — absent sinon, et quand `discounts` dit déjà chacune.
   */
  readonly discountLabel?: DiscountLabelView;
  readonly voucherCents: number;
  readonly deliveryFeeCents: number;
  /**
   * La livraison offerte (doc `frais-et-livraison-offerte.md`) : le
   * barème offert, à son TTC figé, et le libellé figé de la promotion qui
   * l'a offerte (absent : le franco de la route). AFFICHÉE, pas comptable —
   * le port facturé vaut 0 et le total n'en dépend pas.
   */
  readonly freeDelivery?: OrderTicketFreeDelivery;
  /** Le total payé : `articles − remise − bon + port`. */
  readonly totalCents: number;
  readonly byRate: readonly OrderRateAmounts[];
}

/** Une remise du ticket : son libellé figé (absent : le mot de l'écran), son TTC. */
export interface OrderTicketDiscount {
  readonly label?: DiscountLabelView;
  readonly ttcCents: number;
}

/** Le barème offert au ticket ; `pretax` quand son TTC n'a pas été figé. */
export interface OrderTicketFreeDelivery {
  readonly cents: number;
  readonly pretax: boolean;
  readonly label?: DiscountLabelView;
}

export interface OrderTicketLine {
  readonly name: string;
  readonly quantity: number;
  /** `weight` : la quantité est en grammes et l'étiquette au kilo (P4). */
  readonly saleUnit: OrderSaleUnit;
  readonly unitTtcCents: number;
  readonly lineTtcCents: number;
  /** Les options figées de la ligne (« dont 2 tranché ») ; absentes = aucune. */
  readonly optionChoices?: readonly OrderLineOptionChoiceView[];
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
      ...(line.optionChoices === undefined ? {} : { optionChoices: line.optionChoices }),
    });
  }
  return {
    lines,
    articlesCents: lines.reduce((sum, line) => sum + line.lineTtcCents, 0),
    discountCents: ttcTerms.discountCents,
    ...ticketDiscountsOf(order),
    voucherCents: ttcTerms.voucherCents,
    deliveryFeeCents: ttcTerms.deliveryFeeCents,
    ...ticketFreeDeliveryOf(order),
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
  readonly discountLabel?: DiscountLabelView;
} {
  const discounts = order.discounts;
  if (discounts === undefined || discounts.length < 2) {
    return order.discountLabel === undefined ? {} : { discountLabel: order.discountLabel };
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

function ticketFreeDeliveryOf(order: CustomerOrderView): {
  readonly freeDelivery?: OrderTicketFreeDelivery;
} {
  const free = order.freeDelivery;
  if (free === undefined || free.waivedCents <= 0) {
    return {};
  }
  return {
    freeDelivery: {
      cents: free.waivedTtcCents ?? free.waivedCents,
      pretax: free.waivedTtcCents === null,
      ...(free.label === undefined ? {} : { label: free.label }),
    },
  };
}
