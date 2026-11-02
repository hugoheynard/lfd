import type {
  AudiencePickupAddressView,
  AudiencePickupDiscount,
  CartAdjustment,
} from '@lfd/contracts';

import { fill } from '../copy/client-copy.service';
import { formatCents, formatRate } from '../format-money';

/**
 * La remise au retrait, telle que la plateforme l'annonce.
 *
 * 🔴 **La carte « Je passe le prendre » annonçait « Jusqu’à −10 % » en dur**,
 * dans ses libellés, pendant que le dialogue qu'elle ouvre lisait la remise du
 * back-office : 20 % d'un côté, 10 % de l'autre, sur le même écran (corrigé le
 * 2026-09-15). Les deux lisent désormais cette unique source.
 *
 * 🔴 **Le serveur a déjà choisi la remise** depuis le 2026-10-31 (Hugo :
 * « chaque audience n'a le droit qu'à son information ») : chaque point
 * arrive avec UNE remise (`AudiencePickupAddressView.discount`), celle de
 * l'audience déclarée (route publique, `?audience=pro` pour la vitrine) ou
 * établie (`/pickup-addresses/mine`). La boutique ne reçoit plus celles des
 * autres clientèles, et n'a donc plus de clé d'annonce à choisir.
 */

/**
 * La réduction annoncée d'un point à qui regarde, ou `null`.
 *
 * ⚠️ Depuis le 2026-10-22, chaque clientèle a SA remise, avec des familles ou
 * des produits exclus (`promotions.md`, § 2.17).
 * L'étiquette le dit (« sur une sélection », {@link coversSelection}) ; le
 * panier dit l'assiette chiffrée que le devis rend (lot C, 2026-10-23).
 */
export function pickupAdjustmentFor(point: AudiencePickupAddressView): CartAdjustment | null {
  return point.discount?.adjustment ?? null;
}

/** Ce qu'un point promet à qui regarde, en une étiquette. */
export interface PickupOffer {
  readonly label: string;
  /** Vrai quand l'étiquette annonce une remise, et non un tarif. */
  readonly hasOffer: boolean;
}

/** Les trois libellés dont l'étiquette est faite. */
export interface PickupOfferCopy {
  readonly discountTag: string;
  /** La même étiquette quand la remise ne couvre qu'une partie du catalogue. */
  readonly discountTagSelection: string;
  readonly proPrice: string;
  readonly shopPrice: string;
}

/**
 * « −20 % sur tout », ou le tarif qu'on y paie sans remise : « Prix pro » à une
 * société active, « Prix boutique » à un particulier (Hugo, 2026-09-15). Une
 * société en attente lit « Prix pro » depuis le 2026-10-31 : la caisse la
 * sert en pro (`companyServiceOf`, `ClientAudience.servedAsPro`).
 *
 * Une seule écriture pour le dialogue et les cartes de boutique : deux
 * étiquettes calculées chacune de son côté finiraient par se contredire, comme
 * la carte et le dialogue l'ont déjà fait sur le pourcentage.
 */
export function pickupOffer(
  point: AudiencePickupAddressView,
  servedAsPro: boolean,
  copy: PickupOfferCopy,
  locale: string,
): PickupOffer {
  const discount = point.discount;
  if (discount === null) {
    return { label: servedAsPro ? copy.proPrice : copy.shopPrice, hasOffer: false };
  }
  const name = pickupDiscountName(discount, locale);
  if (name !== null) {
    return { label: name, hasOffer: true };
  }
  const tag = coversSelection(discount) ? copy.discountTagSelection : copy.discountTag;
  return { label: fill(tag, { value: discountLabel(discount.adjustment) }), hasOffer: true };
}

/**
 * Le nom réglé sur la promotion — son texte de vignette, sinon son libellé —
 * dans la langue de la boutique, repli français ; `null` quand la promotion
 * n'en porte pas. Aucun nom n'est fabriqué ici (règle de Hugo, 2026-11-02) :
 * l'appelant dit alors la valeur seule.
 */
export function pickupDiscountName(
  discount: AudiencePickupDiscount,
  locale: string,
): string | null {
  const named = discount.tileText ?? discount.label;
  if (named === undefined) {
    return null;
  }
  const text = (locale === 'en' ? named.en : locale === 'it' ? named.it : named.fr) || named.fr;
  return text.trim() === '' ? null : text;
}

/**
 * Vrai quand la remise ne couvre pas TOUT le catalogue : mode `only`, ou au
 * moins une règle qui exclut. « Sur tout » serait alors une promesse que le
 * panier démentirait. En `all_except`, une règle qui réinclut ne retire rien
 * qu'une autre règle n'ait déjà exclu : seules les exclusions comptent.
 */
export function coversSelection(discount: AudiencePickupDiscount): boolean {
  if (discount.scope === 'only') {
    return true;
  }
  return [...discount.categories, ...discount.products].some((rule) => !rule.eligible);
}

/** Un ajustement, tel qu'il se lit : « 10 % » ou « 2,00 € ». */
export function discountLabel(adjustment: CartAdjustment): string {
  return adjustment.mode === 'percent'
    ? formatRate(adjustment.bp / 100)
    : formatCents(adjustment.cents);
}

/**
 * La meilleure remise proposée à qui regarde, ou `null`.
 *
 * Comparer un pourcentage à un montant n'a pas de sens sans panier : on retient
 * donc la meilleure de chaque nature, en préférant le pourcentage — c'est ce que
 * la phrase d'accueil vend, et la seule forme qui parle sans connaître le total.
 */
export function bestPickupDiscount(
  points: readonly AudiencePickupAddressView[],
): AudiencePickupDiscount | null {
  const offers = points.map((point) => point.discount).filter((d) => d !== null);
  const percents = offers.filter((d) => d.adjustment.mode === 'percent');
  const pool = percents.length > 0 ? percents : offers;
  return pool.length === 0 ? null : pool.reduce((best, d) => (worth(d) > worth(best) ? d : best));
}

/** La grandeur comparable d'une remise, dans sa nature (bp ou centimes). */
function worth(discount: AudiencePickupDiscount): number {
  const adjustment = discount.adjustment;
  return adjustment.mode === 'percent' ? adjustment.bp : adjustment.cents;
}
