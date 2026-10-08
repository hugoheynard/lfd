import { type VatExtra, type VatLine, ventilateVat } from '@lfd/money';

/** La part d'un taux dans le calcul : produits, livraison, base, TVA. */
export interface DeliveryVatRateRow {
  readonly rate: number;
  /** HT des produits à ce taux. */
  readonly goodsHtCents: number;
  /** HT de la livraison rattaché à ce taux (0 si elle n'y va pas). */
  readonly deliveryHtCents: number;
  /** Base imposable = produits + livraison de ce taux. */
  readonly baseHtCents: number;
  /** TVA de ce taux, telle que la facture la calcule (`ventilateVat`). */
  readonly vatCents: number;
}

/** Une même commande dans un mode : le calcul par taux, puis les totaux. */
export interface DeliveryVatOutcome {
  readonly rows: readonly DeliveryVatRateRow[];
  readonly totalHtCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
}

/** Une fiche d'exemple : le panier, puis les deux modes côte à côte. */
export interface DeliveryVatExample {
  readonly label: string;
  readonly standard: DeliveryVatOutcome;
  readonly followsGoods: DeliveryVatOutcome;
  /** TTC au taux normal − TTC au prorata : ce que le client paie de plus au taux normal. */
  readonly gapCents: number;
}

/** Les frais de livraison des exemples, hors taxe. */
export const EXAMPLE_DELIVERY_HT_CENTS = 1_000;

/** Le taux normal, celui d'une livraison « prestation distincte ». */
const NORMAL_RATE = 20;

/**
 * Trois paniers de 100 € HT, choisis pour montrer les trois cas : tout à
 * 5,5 % (l'écart le plus grand), tout à 20 % (aucun écart : le port suit déjà
 * 20 %), et un panier mêlé (le port se répartit au prorata).
 */
const BASKETS: readonly { readonly label: string; readonly lines: readonly VatLine[] }[] = [
  { label: '100 € HT de produits à 5,5 %', lines: [{ htCents: 10_000, vatRate: 5.5 }] },
  { label: '100 € HT de produits à 20 %', lines: [{ htCents: 10_000, vatRate: 20 }] },
  {
    label: '60 € HT à 5,5 % et 40 € HT à 20 %',
    lines: [
      { htCents: 6_000, vatRate: 5.5 },
      { htCents: 4_000, vatRate: 20 },
    ],
  },
];

/**
 * **Les fiches de la page, calculées par la fonction qui facture**
 * (`ventilateVat`) plutôt qu'écrites à la main : un chiffre recopié finit par
 * mentir le jour où le calcul change, et c'est précisément le comptable qui
 * le lirait. La TVA de chaque taux est celle de `ventilateVat` ; les bases
 * sont posées à côté pour que le calcul se refasse à la main.
 *
 * Les paniers sont choisis pour que la part de livraison de chaque taux tombe
 * juste au centime (60 % de 10 € = 6 €) : la fiche ne montre aucun arrondi
 * de répartition, seulement celui de la TVA.
 */
export function deliveryVatExamples(): readonly DeliveryVatExample[] {
  return BASKETS.map(({ label, lines }) => {
    const standard = outcomeOf(lines, { htCents: EXAMPLE_DELIVERY_HT_CENTS, vatRate: NORMAL_RATE });
    const followsGoods = outcomeOf(lines, {
      htCents: EXAMPLE_DELIVERY_HT_CENTS,
      followsGoods: true,
    });
    return {
      label,
      standard,
      followsGoods,
      gapCents: standard.totalCents - followsGoods.totalCents,
    };
  });
}

function outcomeOf(lines: readonly VatLine[], delivery: VatExtra): DeliveryVatOutcome {
  const result = ventilateVat({ lines, discountCents: 0, extras: [delivery] });
  const goodsHt = lines.reduce((sum, line) => sum + line.htCents, 0);
  const rates = [
    ...new Set([
      ...lines.map((line) => line.vatRate),
      ...('vatRate' in delivery ? [delivery.vatRate] : []),
    ]),
  ].sort((a, b) => a - b);
  const rows = rates.map((rate): DeliveryVatRateRow => {
    const goodsHtCents = lines
      .filter((line) => line.vatRate === rate)
      .reduce((sum, line) => sum + line.htCents, 0);
    const deliveryHtCents =
      'vatRate' in delivery
        ? delivery.vatRate === rate
          ? delivery.htCents
          : 0
        : Math.round((delivery.htCents * goodsHtCents) / goodsHt);
    return {
      rate,
      goodsHtCents,
      deliveryHtCents,
      baseHtCents: goodsHtCents + deliveryHtCents,
      vatCents: result.vat.find((share) => share.rate === rate)?.amountCents ?? 0,
    };
  });
  return {
    rows,
    totalHtCents: goodsHt + delivery.htCents,
    vatCents: result.vatTotalCents,
    totalCents: result.totalCents,
  };
}
