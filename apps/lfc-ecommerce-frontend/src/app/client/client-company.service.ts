import { computed, inject, Injectable } from '@angular/core';
import type { CompanyStatus, CompanyView } from '@lfd/contracts';

import { directDebitSuspended, settlesOnAccount } from '../account/settles-on-account';
import { AccountService } from '../account/account.service';
import { ClientWorkspace, companyName } from './client-workspace.service';

/** L'état d'un dossier client : à compléter, ou le statut de sa société. */
export type DossierState = 'incomplete' | CompanyStatus;

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
 * Celle de l'**espace de travail** courant (`ClientWorkspace`), `null` en perso.
 * C'était la première de `GET /me`, pendant que le serveur chiffrait et
 * encaissait pour `null` dès la deuxième société : l'écran montrait une maison,
 * la caisse en servait une autre (plan espace de travail, §1).
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
  private readonly workspace = inject(ClientWorkspace);

  /** La société de l'espace, ou `null` — anonyme, perso, ou compte sans entreprise. */
  readonly company = computed<CompanyView | null>(() => this.workspace.company());

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
    return companyName(company);
  });

  /** Le compte est-il ouvert ? La pastille de la carte n'affirme plus « Actif » à l'aveugle. */
  readonly isActive = computed(() => this.company()?.status === 'active');

  /**
   * **Où en est le dossier**, tel que l'écran doit le dire — `null` tant qu'on ne
   * le SAIT pas (compte non lu, lecture en vol ou en échec).
   *
   * `incomplete` : la personne est reconnue et n'a aucune société — le cas exact
   * de qui arrive par la porte pro. Le reste est le statut de la société.
   */
  readonly dossier = computed<DossierState | null>(() => {
    if (this.account.status() !== 'ready') {
      return null;
    }
    return this.company()?.status ?? 'incomplete';
  });
  /**
   * La condition de règlement **convenue et exercée**, en un mot — `false`
   * quand le prélèvement est suspendu (`settlesOnAccount`).
   *
   * Vide = paiement à la commande, ce que tout le monde peut faire de toute
   * façon. Ce n'est pas une absence de réglage, c'est le défaut — d'où une
   * phrase plutôt qu'un tiret.
   */
  readonly hasDeferredTerm = computed(() => settlesOnAccount(this.company()));

  /** Le mensuel est accordé, mais son prélèvement est suspendu par la comptabilité. */
  readonly directDebitSuspended = computed(() => directDebitSuspended(this.company()));
}
