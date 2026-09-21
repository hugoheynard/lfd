import { computed, inject, Injectable } from '@angular/core';

import { ClientCompany } from '../client-company.service';

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
 * du serveur (`unitPriceTtcCents`), passé par la ventilation de la caisse. Le
 * dériver ici du hors taxe et du taux l'aurait fait diverger d'un centime sur
 * la moitié des prix à 20 % — l'étiquette du rayon aurait cessé de valoir ce
 * que le panier facture.
 *
 * Pourquoi un professionnel garde le hors taxe : il récupère la taxe, raisonne
 * sa marge dessus, et la retrouve telle quelle sur sa facture. Lui montrer un
 * TTC lui demanderait de refaire le calcul à chaque ligne.
 */
@Injectable({ providedIn: 'root' })
export class ShopPriceBasis {
  private readonly company = inject(ClientCompany);

  /** Vrai pour un visiteur anonyme comme pour un compte personnel. */
  readonly showsTtc = computed(() => this.company.company() === null);
}
