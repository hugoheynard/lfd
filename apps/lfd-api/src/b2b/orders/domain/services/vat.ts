import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

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

/**
 * Taux de la prestation de livraison (transport) — taux normal.
 *
 * Une **constante de domaine**, et pas une donnée : le taux d'une prestation de
 * transport est le taux normal, il ne se paramètre pas par boutique. Les taux
 * des marchandises, eux, sont de la donnée — ils viennent du PIM, article par
 * article (cf. `documentation/pim/contextes-et-points-de-vente.md`).
 *
 * Une constante `DEFAULT_FOOD_VAT_RATE` vivait ici et n'était lue que par son
 * propre test : elle nommait un « défaut alimentaire » que rien n'appliquait, ce
 * qui laissait croire qu'un article sans taux serait facturé à 5,5 %. Il est
 * écarté de la vente. Nommer un défaut qui n'existe pas est pire que rien.
 */
export const DELIVERY_VAT_RATE = 20;

/**
 * Une surtaxe sans taux ne se facture pas.
 *
 * Une **erreur technique** et non métier : ce n'est pas une demande refusée mais
 * un réglage incomplet qui a franchi les gardes d'écriture. Elle ne devrait
 * jamais sortir — le réglage exige son taux — et si elle sort, c'est un bug à
 * corriger, pas une phrase à montrer au client.
 */
export class MissingLateFeeVatRateError extends TechnicalError {
  constructor() {
    super("orders.late_fee.vat_rate_missing", "Surtaxe sans taux de TVA.");
  }
}

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
  /** Surtaxe de commande tardive, HT, en centimes. `0` = aucune. */
  readonly lateFeeCents: number;
  /**
   * Taux de la surtaxe en %, **sans valeur par défaut**.
   *
   * Contrairement au transport — dont le taux est une constante de domaine parce
   * qu'une prestation de transport est au taux normal, point — celui de la
   * surtaxe est un **réglage** : personne ne sait encore s'il suit les
   * marchandises ou la prestation, et inventer une réponse la facturerait
   * rétroactivement sur toutes les commandes tardives.
   *
   * Il ne peut donc pas manquer quand `lateFeeCents` n'est pas nul, et
   * {@link computeVatCents} le refuse plutôt que de retomber sur un défaut.
   */
  readonly lateFeeVatRate: number | null;
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

  // La surtaxe porte SON taux, réglé, jamais un défaut. Un montant taxé au
  // hasard se rattrape à la main, commande par commande — et seulement si
  // quelqu'un s'en aperçoit.
  if (input.lateFeeCents !== 0) {
    if (input.lateFeeVatRate === null) {
      throw new MissingLateFeeVatRateError();
    }
    vat += Math.round((input.lateFeeCents * input.lateFeeVatRate) / 100);
  }
  return vat;
}
