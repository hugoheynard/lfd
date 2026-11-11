import { computed, inject, Injectable } from '@angular/core';

import type { ShopItemView } from '@lfd/contracts';

import { ClientCompany } from '../client-company.service';
import { formatCents, formatMillicents } from '../format-money';
import { ProVisit } from './pro-visit.service';
import { isSoldByWeight, type SaleTerms } from './sale-unit';

/**
 * **Dans quelle assiette le rayon affiche ses prix** — hors taxe ou taxe
 * comprise.
 *
 * 🔴 **La règle est la MÊME que celle du serveur** : sans société, on achète
 * comme un particulier. Le serveur s'en sert pour choisir le PRIX ; cet écran
 * s'en sert pour choisir l'UNITÉ dans laquelle il le dit. Deux conséquences
 * d'un seul fait, pas deux règles.
 *
 * ⚠️ **Ce service ne calcule aucun montant, et c'est délibéré.** Le TTC arrive
 * du serveur — `unitPriceTtcCents` au rayon, `lineTotalTtcCents` au panier —,
 * passé par la ventilation de la caisse. Le dériver ici du hors taxe et du taux
 * l'aurait fait diverger d'un centime sur la moitié des prix à 20 % —
 * l'étiquette du rayon aurait cessé de valoir ce que le panier facture.
 *
 * Trois écrans le lisent (vérifié le 2026-09-21) : la vignette, la fiche
 * produit et la ligne de panier. Chacun décide **seul**, parce qu'un parent qui
 * choisirait l'assiette pourrait passer un montant hors taxe à un enfant qui
 * écrit « TTC », et rien ne le lui dirait.
 *
 * Pourquoi un professionnel garde le hors taxe : il récupère la taxe, raisonne
 * sa marge dessus, et la retrouve telle quelle sur sa facture. Lui montrer un
 * TTC lui demanderait de refaire le calcul à chaque ligne.
 */
@Injectable({ providedIn: 'root' })
export class ShopPriceBasis {
  private readonly company = inject(ClientCompany);
  private readonly proVisit = inject(ProVisit);

  /**
   * Vrai pour un visiteur anonyme comme pour un compte personnel — sauf le
   * visiteur venu de `/pro`, qui lit les tarifs pro hors taxe (`ProVisit`).
   */
  readonly showsTtc = computed(() => this.company.company() === null && !this.proVisit.active());
}

/**
 * **Le prix unitaire d'un article tel que le rayon l'écrit**, dans l'assiette
 * choisie : le TTC servi, ou le HT EXACT d'un pro (« 0,8184 € », plan
 * `plan-remise-par-ligne.md`, § 18.6 — option (b)). Lu par la vignette et
 * par la carte de suggestion du panier — une seule mise en forme, pour qu'un
 * même article ne s'affiche pas à deux prix.
 */
export function shelfPriceLabel(
  item: ShopItemView,
  showsTtc: boolean,
  basisSuffix: string,
  perKilogram: string,
): string {
  const unit = shelfUnitLabel(item, perKilogram);
  const label = `${shelfAmountLabel(item, showsTtc)} ${basisSuffix}`;
  return unit === null ? label : `${label} ${unit}`;
}

/**
 * Le montant seul du prix de rayon (« 12,40 € », « 0,8184 € »), sans
 * assiette ni unité — pour l'écran qui met l'assiette en forme à part.
 */
export function shelfAmountLabel(item: ShopItemView, showsTtc: boolean): string {
  return showsTtc
    ? formatCents(item.unitPriceTtcCents)
    : formatMillicents(item.unitPriceMillicents);
}

/**
 * L'unité du prix de rayon : « / kg » au poids — le prix servi EST le prix au
 * kilo (P4) —, `null` à la pièce. Elle se place APRÈS l'assiette :
 * « 12,40 € HT / kg », comme une étiquette de balance (Hugo, 2026-11-06).
 */
export function shelfUnitLabel(item: ShopItemView, perKilogram: string): string | null {
  return isSoldByWeight(item) ? perKilogram : null;
}

/**
 * **Le prix au kilo d'un article vendu à la pièce**, en mention fine sous le
 * prix (« 12,40 € TTC / kg », dans l'ordre de l'étiquette au poids), ou `null` quand il n'y a rien à dire.
 *
 * Le montant est celui que le serveur SERT : le kilo saisi au référentiel,
 * ou, sous une promotion qui baisse la pièce, le kilo après promotion — que
 * le serveur calcule dans la proportion de la pièce
 * (`saisir-un-prix.md`, § 2). Cet écran ne calcule rien.
 *
 * Rien pour un article au poids : son prix servi EST déjà le prix au kilo, le
 * redire doublerait la ligne. Rien non plus quand l'assiette affichée n'a pas
 * de prix au kilo — on ne montre jamais l'autre en repli (le contrat le
 * dit à `proPricePerKgMillicents`). Informatif : rien ne le facture.
 */
export function perKiloHintLabel(
  item: ShopItemView,
  showsTtc: boolean,
  basisSuffix: string,
  perKilogram: string,
): string | null {
  if (isSoldByWeight(item)) {
    return null;
  }
  const ttc = item.publicPricePerKgTtcCents ?? null;
  const ht = item.proPricePerKgMillicents ?? null;
  const amount = showsTtc
    ? ttc === null
      ? null
      : formatCents(ttc)
    : ht === null
      ? null
      : formatMillicents(ht);
  return amount === null ? null : `${amount} ${basisSuffix} ${perKilogram}`;
}

/**
 * **Le tarif barré** dans l'assiette de qui regarde : le TTC servi par le
 * serveur pour un particulier, le HT exact pour un pro — même échelle que le prix servi
 * à côté de lui (§ 18.6, option (b)).
 */
export function struckPriceLabel(
  item: Pick<ShopItemView, 'catalogPriceMillicents' | 'catalogPriceTtcCents'>,
  showsTtc: boolean,
): string | null {
  // Régression (2026-11-01) : en TTC, le barré formatait le tarif HT —
  // 71,09 € barré au-dessus de 60,00 € TTC, pour un article à 75,00 € TTC.
  if (showsTtc) {
    return item.catalogPriceTtcCents === undefined ? null : formatCents(item.catalogPriceTtcCents);
  }
  return item.catalogPriceMillicents === undefined
    ? null
    : formatMillicents(item.catalogPriceMillicents);
}

/**
 * **Le kilo saisi, à barrer** à côté du kilo servi, dans l'assiette de qui
 * regarde — ou `null`. Le serveur ne le pose que sous une PROMOTION qui baisse
 * la pièce (`catalogPricePerKgTtcCents` / `catalogPricePerKgMillicents`) :
 * une mercuriale, un palier, un prix plus haut n'en ont pas, et l'absence EST
 * la réponse. Rien au poids, comme {@link perKiloHintLabel}.
 */
export function struckPerKiloLabel(
  item: Pick<ShopItemView, 'catalogPricePerKgMillicents' | 'catalogPricePerKgTtcCents'> & SaleTerms,
  showsTtc: boolean,
): string | null {
  if (isSoldByWeight(item)) {
    return null;
  }
  if (showsTtc) {
    return item.catalogPricePerKgTtcCents === undefined
      ? null
      : formatCents(item.catalogPricePerKgTtcCents);
  }
  return item.catalogPricePerKgMillicents === undefined
    ? null
    : formatMillicents(item.catalogPricePerKgMillicents);
}
