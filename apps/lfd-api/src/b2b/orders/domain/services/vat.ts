/**
 * Moteur de **TVA** de la commande — pur et déterministe.
 *
 * Les prix du catalogue sont **HT**. La TVA se calcule par **taux** : on regroupe
 * les lignes par taux (5,5 % alimentaire, 20 % non-alimentaire, …), on déduit la
 * remise (retrait) au prorata de chaque groupe, puis on applique le taux au net.
 * Les **frais de livraison** (service coursier) portent leur propre taux — 20 %
 * par défaut (prestation de transport).
 *
 * Tout est en **centimes entiers** ; l'arrondi se fait par groupe (règle usuelle),
 * jamais sur une somme flottante globale.
 */

/** Taux réduit produits alimentaires (boulangerie) — le défaut du catalogue. */
export const DEFAULT_FOOD_VAT_RATE = 5.5;

/** Taux de la prestation de livraison (transport) — taux normal. */
export const DELIVERY_VAT_RATE = 20;

/** Une ligne pour le calcul : son total **HT** (centimes) et son taux (en %). */
export interface VatLine {
  readonly htCents: number;
  readonly vatRate: number;
}

/** Entrées du calcul de TVA d'une commande. */
export interface VatInput {
  readonly lines: readonly VatLine[];
  /** Remise (retrait) déduite des marchandises, HT, en centimes. */
  readonly discountCents: number;
  /** Frais de livraison (zone), HT, en centimes. */
  readonly deliveryFeeCents: number;
  /** Taux de la livraison en %, défaut {@link DELIVERY_VAT_RATE}. */
  readonly deliveryVatRate?: number;
}

/**
 * TVA totale de la commande, en centimes. Somme de la TVA des marchandises (par
 * taux, remise déduite au prorata) et de la TVA de la livraison.
 */
export function computeVatCents(input: VatInput): number {
  const subtotal = input.lines.reduce((sum, line) => sum + line.htCents, 0);

  const baseByRate = new Map<number, number>();
  for (const line of input.lines) {
    baseByRate.set(line.vatRate, (baseByRate.get(line.vatRate) ?? 0) + line.htCents);
  }

  let vat = 0;
  for (const [rate, base] of baseByRate) {
    const discountShare = subtotal > 0 ? (input.discountCents * base) / subtotal : 0;
    vat += Math.round(((base - discountShare) * rate) / 100);
  }

  const deliveryRate = input.deliveryVatRate ?? DELIVERY_VAT_RATE;
  vat += Math.round((input.deliveryFeeCents * deliveryRate) / 100);
  return vat;
}
