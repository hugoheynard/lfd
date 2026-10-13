import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { SiteView } from '@lfd/contracts';
import { AddressView } from '@lfd/b2b-ui/address';
import { HoursView } from '@lfd/b2b-ui/hours';
import { postalFrom } from '@lfd/b2b-ui/company';
import { formatAdjustmentValue } from '@lfd/b2b-ui/pricing';
import type { PostalAddress } from '@lfd/b2b-ui/address';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { discountAudienceSuffix } from '../../../b2b/reglages/pickup-discount-audience';
import { openingRows } from '../../../b2b/reglages/pickup-opening.model';
import { roleLabels } from '../site-role-labels';
import { SITES_PATH } from '../sites-path';
import { SitesService } from '../sites.service';

export { roleLabels } from '../site-role-labels';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Réglages › Sites** — nos lieux, leurs rôles et leurs couleurs (plan
 * `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`,
 * §3.4, lot S1). C'est l'ancienne liste des points de retrait : un site EST
 * le point, élargi ; `/b2b/reglages/points-de-retrait` redirige ici. Les
 * archivés sont listés à la fin (le serveur les trie), marqués comme tels.
 *
 * Ce qui suit est l'histoire de la liste des points, toujours vraie.
 *
 * **Points de retrait** — « E-commerce LFC → Réglages ». Les laboratoires où le
 * client vient chercher sa commande.
 *
 * Elle ne fait que **lister et mener** : la saisie et la suppression vivent sur
 * la page d'un point (`PickupAddressPage`), depuis le 2026-09-16. Elles
 * passaient par un panneau, qui portait déjà six sujets ; un septième et un
 * huitième arrivent avec les créneaux publics.
 *
 * Elle était la première carte d'un onglet « Retraits & livraisons » des
 * Réglages, avec les zones et les heures limites. Les trois se sont séparées le
 * 2026-09-15 (plan « remise et livraison par clientèle », D6) : chacune a sa
 * page, et l'ancienne adresse redirige ici.
 */
@Component({
  selector: 'app-sites-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressView,
    HoursView,
    FoldCardComponent,
    FoldBadgeComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldButtonComponent,
    FoldIconComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './sites-page.html',
  styleUrl: './sites-page.scss',
})
export class SitesPage {
  private readonly sites = inject(SitesService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly addresses = signal<readonly SiteView[]>([]);
  protected readonly roles = roleLabels;

  /** Les plages d'ouverture déclarées, lisibles. Vide = aucune heure opposée. */
  protected readonly hours = openingRows;

  /**
   * « − 10 % · B2B » : la remise ET à qui elle va. Sans la clientèle, une remise
   * fermée aux particuliers se lirait comme offerte à tous.
   */
  protected discountLabel(point: SiteView): string {
    if (point.discount === null) {
      return '';
    }
    return `− ${formatAdjustmentValue(point.discount)}${discountAudienceSuffix(point.discountAudiences)}`;
  }

  /**
   * L'adresse à afficher. Un point sans nom d'usage prend celui de sa ville :
   * une carte sans titre ne se distingue pas de sa voisine dans la liste.
   */
  protected postal(point: SiteView): PostalAddress {
    return { ...postalFrom(point), label: point.label || point.ville };
  }

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.addresses.set(await this.sites.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected add(): void {
    void this.router.navigate([SITES_PATH, 'nouveau']);
  }

  /**
   * Ouvre la page du point. Pas de rechargement à prévoir au retour : la page
   * relit la liste elle-même, et c'est de là qu'elle tire aussi le fait qu'un
   * point soit le dernier — un compte que cette liste n'a plus à lui passer.
   */
  protected edit(address: SiteView): void {
    void this.router.navigate([SITES_PATH, address.id]);
  }
}
