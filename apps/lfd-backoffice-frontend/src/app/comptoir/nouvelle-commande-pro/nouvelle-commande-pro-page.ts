import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { companyDisplayName } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompany } from '../../comptes-clients/admin-company';
import { matchesCompanySearch } from '../../comptes-clients/company-search';

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
 * Seuls les comptes **actifs** sont proposés : c'est le statut qui fait d'une
 * société une clientèle pro (`audienceOf`, la même règle que le serveur).
 * Proposer un compte en attente mènerait à une commande de particulier, ce que
 * l'entrée « commande pro » ne promet pas.
 *
 * La recherche est celle de la liste des comptes (`matchesCompanySearch`) :
 * au comptoir comme au téléphone, on arrive avec un nom, un SIRET ou la
 * personne qui administre l'espace.
 */
@Component({
  selector: 'app-nouvelle-commande-pro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
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
  private readonly companies = inject(AdminCompaniesService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  private readonly active = signal<readonly AdminCompany[]>([]);
  protected readonly query = signal('');

  /** Aucun compte pro du tout — distinct d'une recherche qui ne trouve rien. */
  protected readonly noActiveCompany = computed(() => this.active().length === 0);

  protected readonly rows = computed<readonly CompanyRow[]>(() =>
    this.active()
      .filter((company) => matchesCompanySearch(company, this.query()))
      .map((company) => ({
        id: company.id,
        name: companyDisplayName(company),
        detail: `${company.reference} · SIRET ${company.siret}`,
      })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const all = await this.companies.list();
      this.active.set(all.filter((company) => company.status === 'active'));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected onSearchChange(query: string): void {
    this.query.set(query);
  }

  protected choose(companyId: string): void {
    void this.router.navigate(['/comptes-clients', companyId, 'nouvelle-commande']);
  }
}
