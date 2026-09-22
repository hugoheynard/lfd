import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { CompanyView } from '@lfd/contracts';
import { RouterLink } from '@angular/router';
import { FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { AccountService } from '../../../account/account.service';
import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * **Les comptes professionnels de la personne** — et de quoi en ouvrir un
 * (Hugo, 2026-09-22).
 *
 * ## Elle s'adresse à TOUT LE MONDE, et dit deux choses différentes
 *
 * 🔴 Elle a d'abord été écrite pour ne s'afficher **qu'à qui n'a aucune
 * société** — l'idée étant qu'on ne propose pas d'ouvrir ce qu'on a déjà. Hugo
 * l'a corrigée le jour même : « si l'utilisateur a déjà des comptes pros, j'en
 * veux la liste aussi dans cette section ».
 *
 * Il a raison, et pour une raison qui dépasse la commodité : **rien ailleurs
 * dans la boutique ne dit à quelles entreprises on est rattaché**. Le menu du
 * compte permet d'y BASCULER, mais il faut l'ouvrir pour le savoir. Un écran
 * qui s'appelle « mon profil » doit pouvoir répondre « et mes entreprises,
 * alors ? ». Et ouvrir un SECOND compte est un cas réel, pas un cas limite.
 *
 * Le bloc porte donc deux états, un seul titre par état, et le lien dans les
 * deux — « ouvrir un compte » devient « en ouvrir un autre ».
 *
 * ## Rien tant qu'on ne SAIT pas
 *
 * La condition d'affichage est `status === 'ready'` : tant que `/me` est en
 * vol, on ignore si la personne a des sociétés, et un bloc qui s'afficherait
 * « aucune » puis se remplirait mentirait pendant une seconde.
 *
 * ⚠️ La liste vient de `AccountService`, volontairement **pas** de
 * `ClientCompany.company()` : cette dernière est la société de l'ESPACE DE
 * TRAVAIL courant, `null` dans l'espace perso — y compris pour quelqu'un qui a
 * déjà une ou plusieurs sociétés (`client-workspace.service.ts`, vérifié le
 * 2026-09-22). Elle aurait affiché « aucun compte pro » à un client pro
 * simplement parce qu'il regarde son profil.
 *
 * ## Un LIEN, pas un bouton qui navigue
 *
 * `routerLink` vers `/ouverture-compte-pro` : la barre d'état annonce la
 * destination, et le lien s'ouvre dans un nouvel onglet. Un bouton qui
 * appellerait `router.navigate` ne rendrait ni l'un ni l'autre. La cible
 * existe dans `app.routes.ts`, et `lint:router-links` le tient.
 *
 * ## Discret
 *
 * Une carte, sans `fold-page-section` autour : elle est posée après ce que la
 * personne est venue faire, pas en troisième sujet de la page.
 */
@Component({
  selector: 'app-pro-account-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent, RouterLink],
  templateUrl: './pro-account-section.html',
  styleUrl: './pro-account-section.scss',
})
export class ProAccountSection {
  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);

  /** Vrai une fois `/me` lu — avec ou sans société. */
  protected readonly ready = computed(() => this.account.status() === 'ready');

  /** Les entreprises auxquelles la personne est rattachée, telles que `/me` les dit. */
  protected readonly mine = this.account.companies;

  /**
   * Le nom qu'on lit, pas celui du greffe.
   *
   * L'enseigne est ce que la personne reconnaît — c'est sous ce nom qu'elle
   * commande. La raison sociale ne sert de repli que si l'enseigne est vide,
   * ce qui arrive tant que le dossier n'est pas complété.
   */
  protected name(company: CompanyView): string {
    return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
  }
}
