import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { companyDisplayName, type CounterCustomerCard } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
} from 'fold-ng';

import { copyLink } from '../../comptabilite/copy-link';
import {
  COUNTER_ORDER_PICKER_LINK,
  counterPlacedOrderOf,
} from '../../commandes/nouvelle-commande/order-entry-origin';
import { NotifyService } from '../../notify.service';
import { CounterCustomersService } from '../counter-customers.service';
import { matchesCounterSearch } from '../counter-customer-search';

type LoadState = 'loading' | 'ready' | 'error';

/** Un compte tel que la liste le montre : son nom lisible et ce qui le distingue. */
interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
}

/**
 * **Nouvelle commande pro, depuis le comptoir** — trouver le compte, puis
 * passer la main à l'écran de saisie du Commercial.
 *
 * Cette page ne saisit rien. Elle n'existe que parce que le comptoir n'a pas de
 * fiche client ouverte : il faut d'abord savoir POUR QUI on commande. Ensuite,
 * c'est `comptes-clients/:id/nouvelle-commande`, inchangé — une seconde saisie
 * divergerait au premier changement de règle.
 *
 * Seuls les comptes **actifs** sont proposés — c'est le serveur qui filtre
 * (`GET /admin/counter/customers`) : c'est le statut qui fait d'une société une
 * clientèle pro. La liste se lit sous `b2b_counter:read`, jamais sous
 * `b2b_companies` : le vendeur de comptoir n'a pas la fiche client.
 *
 * Elle est aussi le RETOUR de la saisie : la commande passée revient ici avec
 * son numéro et son lien de règlement, affiché en clair parce que le client
 * est en face — le presse-papiers seul ne se montre pas.
 *
 * La recherche porte sur les champs de la carte (`matchesCounterSearch`) :
 * raison sociale, enseigne, référence, SIRET — pas le propriétaire, que la
 * carte du comptoir ne porte pas.
 */
@Component({
  selector: 'app-nouvelle-commande-pro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldSearchComponent,
  ],
  templateUrl: './nouvelle-commande-pro-page.html',
  styleUrl: './nouvelle-commande-pro-page.scss',
})
export class NouvelleCommandeProPage {
  private readonly customers = inject(CounterCustomersService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /**
   * La commande qu'on vient de passer, transmise par l'état de navigation de la
   * saisie. Lue une fois, à l'arrivée : elle concerne le client qui est encore
   * là, pas le suivant.
   */
  protected readonly placed = signal(
    counterPlacedOrderOf(this.router.currentNavigation()?.extras.state),
  );

  protected readonly state = signal<LoadState>('loading');
  private readonly active = signal<readonly CounterCustomerCard[]>([]);
  protected readonly query = signal('');

  /** Aucun compte pro du tout — distinct d'une recherche qui ne trouve rien. */
  protected readonly noActiveCompany = computed(() => this.active().length === 0);

  protected readonly rows = computed<readonly CompanyRow[]>(() =>
    this.active()
      .filter((card) => matchesCounterSearch(card, this.query()))
      .map((card) => ({
        id: card.id,
        name: companyDisplayName({ raisonSociale: card.name, enseigne: card.tradeName }),
        detail: `${card.reference} · SIRET ${card.siret}`,
      })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      // Le serveur ne rend que les sociétés actives : aucun filtre à refaire ici.
      this.active.set(await this.customers.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected onSearchChange(query: string): void {
    this.query.set(query);
  }

  protected choose(companyId: string): void {
    void this.router.navigate([COUNTER_ORDER_PICKER_LINK, companyId]);
  }

  protected copy(url: string): void {
    void copyLink(url, this.notify);
  }

  /** Le client suivant : on range le récapitulatif du précédent. */
  protected dismissPlaced(): void {
    this.placed.set(null);
  }
}
