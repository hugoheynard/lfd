import { computed, inject, Injectable } from '@angular/core';

import type { ShopItemView } from '@lfd/contracts';
import { unitPriceCents } from '@lfd/money';

import { ClientCompany } from '../client-company.service';
import { formatCents } from '../format-money';
import { ProVisit } from './pro-visit.service';

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
 * choisie : le TTC servi, ou le HT arrondi au centime. Lu par la vignette et
 * par la carte de suggestion du panier — une seule mise en forme, pour qu'un
 * même article ne s'affiche pas à deux prix.
 */
export function shelfPriceLabel(item: ShopItemView, showsTtc: boolean): string {
  return showsTtc
    ? formatCents(item.unitPriceTtcCents)
    : formatCents(unitPriceCents(item.unitPriceMillicents));
}
