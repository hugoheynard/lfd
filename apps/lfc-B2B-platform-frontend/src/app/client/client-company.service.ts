import { computed, inject, Injectable } from '@angular/core';
import type { CompanyView } from '@lfd/contracts';

import { AccountService } from '../account/account.service';

/**
 * **La société du client**, telle que notre base la porte (`GET /me`).
 *
 * 🔴 L'écran « Mon compte » affichait « Brasserie Marchand · Marchand & Fils »,
 * avec son SIRET, son n° de TVA et sa référence — tout écrit en dur. Quelqu'un
 * de connecté y lisait donc le nom d'une AUTRE maison que la sienne, sur l'écran
 * qui est précisément censé lui dire qui il est chez nous.
 *
 * ## Quelle société
 *
 * La première de `GET /me`. La boutique n'a pas encore de sélecteur — le même
 * point de branchement que le carnet d'adresses, et pour la même raison
 * (cf. `ClientAddresses`).
 *
 * ## Rien pour un visiteur anonyme
 *
 * `null` tant que personne n'est reconnu, et l'écran le dit. Un nom de
 * démonstration serait le nom de quelqu'un d'autre — c'est vrai d'une adresse,
 * c'est vrai d'une raison sociale, et ça l'est plus encore d'un SIRET.
 */
@Injectable({ providedIn: 'root' })
export class ClientCompany {
  private readonly account = inject(AccountService);

  /** La société, ou `null` — anonyme, ou compte sans entreprise. */
  readonly company = computed<CompanyView | null>(() => this.account.companies()[0] ?? null);

  /**
   * Le nom sous lequel la maison se reconnaît : son **enseigne** si elle en a
   * une, sa raison sociale sinon. C'est l'ordre qu'attend celui qui lit — on
   * s'appelle « La Folie Douce », pas « SAS Les Tommeuses ».
   */
  readonly name = computed(() => {
    const company = this.company();
    if (company === null) {
      return '';
    }
    return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
  });

  /** Le compte est-il ouvert ? La pastille de la carte n'affirme plus « Actif » à l'aveugle. */
  readonly isActive = computed(() => this.company()?.status === 'active');

  /**
   * La condition de règlement **convenue**, en un mot.
   *
   * Vide = paiement à la commande, ce que tout le monde peut faire de toute
   * façon. Ce n'est pas une absence de réglage, c'est le défaut — d'où une
   * phrase plutôt qu'un tiret.
   */
  readonly hasDeferredTerm = computed(() => (this.company()?.grantedTerms.length ?? 0) > 0);
}
