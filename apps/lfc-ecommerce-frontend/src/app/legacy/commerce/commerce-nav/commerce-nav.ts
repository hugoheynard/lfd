import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

import { companyDisplayName } from '../../../account/account.model';
import { CommerceContextService } from '../commerce-context.service';

/**
 * Sélecteur d'**établissement** commun au parcours d'achat — un `fold-view-nav`
 * (même widget que « Mes entreprises ») dont les onglets sont les sociétés
 * gérées. La sélection est partagée via `CommerceContextService` pour que toutes
 * les pages (commandes, paniers…) regardent le même établissement. Masqué s'il
 * n'y en a qu'un.
 *
 * La navigation entre sections (Boutique / Mes paniers / Commandes) vit désormais
 * dans le **menu principal** de l'app, plus dans ce composant.
 */
@Component({
  selector: 'app-commerce-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewNavComponent],
  templateUrl: './commerce-nav.html',
  styleUrl: './commerce-nav.scss',
})
export class CommerceNav {
  protected readonly context = inject(CommerceContextService);

  protected readonly companies = this.context.companies;
  protected readonly multi = computed(() => this.companies().length > 1);

  /** Onglets d'établissements — la sélection pilote `CommerceContextService`. */
  protected readonly companyItems = computed<FoldViewNavItem[]>(() =>
    this.companies().map((company) => ({
      key: company.id,
      label: companyDisplayName(company),
      icon: 'company',
    })),
  );

  protected onSelectCompany(companyId: string): void {
    this.context.select(companyId);
  }
}
