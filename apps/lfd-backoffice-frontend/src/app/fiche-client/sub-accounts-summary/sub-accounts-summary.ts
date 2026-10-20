import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SubAccountView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { STATUS_LABELS } from '../../comptes-clients/admin-company';

/**
 * **Les sous-comptes, en résumé** — la deuxième carte du tableau de bord
 * d'un principal (Hugo, 2026-10-20). En lecture : chaque site mène à sa
 * fiche, et « Gérer » à l'onglet Sous-comptes, où se créent et se rattachent
 * les sites.
 *
 * Rien ne s'affiche sans sous-compte, ni pendant la lecture, ni si elle
 * échoue : la carte est un raccourci, et le tableau de bord ne doit pas
 * perdre ses chiffres pour elle.
 */
@Component({
  selector: 'app-sub-accounts-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './sub-accounts-summary.html',
  styleUrl: './sub-accounts-summary.scss',
})
export class SubAccountsSummary {
  private readonly hierarchy = inject(AdminCompanyHierarchyService);

  readonly companyId = input.required<string>();

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly subAccounts = signal<readonly SubAccountView[]>([]);

  constructor() {
    effect(() => {
      void this.load(this.companyId());
    });
  }

  private async load(companyId: string): Promise<void> {
    try {
      const view = await this.hierarchy.hierarchyOf(companyId);
      this.subAccounts.set(view?.subAccounts ?? []);
    } catch {
      // Un raccourci qui échoue disparaît : la liste complète reste à l'onglet.
      this.subAccounts.set([]);
    }
  }
}
