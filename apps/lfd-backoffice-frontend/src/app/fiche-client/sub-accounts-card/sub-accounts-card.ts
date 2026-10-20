import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { type AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { FORM_PANEL } from '../informations/fiche-client.panels';
import { FollowGrid } from '../follow-grid/follow-grid';
import { AttachSubAccountPanel } from '../panels/attach-sub-account-panel/attach-sub-account-panel';
import { SubAccountPanel } from '../panels/sub-account-panel/sub-account-panel';

/**
 * **Les sous-comptes d'un principal** (`sous-comptes.md` §4) : la liste
 * des enfants (enseigne, ville, statut, aspects suivis), « Créer un
 * sous-compte » et « Rattacher un compte client existant ». La case « Compte
 * de groupe » vit dans Informations depuis le 2026-10-20 (`GroupAccountCard`).
 *
 * Calqué sur la barre de déclinaisons de la fiche produit : chaque enfant
 * mène à SA fiche, où l'on règle ce qu'il suit — on ne règle pas un
 * sous-compte depuis la fiche de son principal.
 *
 * N'est posée que sur une fiche SANS principal : un sous-compte n'a pas de
 * sous-compte (profondeur 1).
 */
@Component({
  selector: 'app-sub-accounts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FollowGrid,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './sub-accounts-card.html',
  styleUrl: './sub-accounts-card.scss',
})
export class SubAccountsCard {
  private readonly panels = inject(FoldPanelHostService);

  readonly company = input.required<AdminCompanyDetail>();

  /** La hiérarchie a changé : la fiche relit. */
  readonly changed = output<void>();

  protected readonly subAccounts = computed(() => this.company().hierarchy.subAccounts);

  protected readonly parentName = computed(() => {
    const company = this.company();
    return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
  });

  protected create(): void {
    const company = this.company();
    void this.panels
      .open(SubAccountPanel, {
        ...FORM_PANEL,
        data: {
          parentId: company.id,
          parentName: this.parentName(),
          parentRaisonSociale: company.raisonSociale,
          parentSiret: company.siret,
          parentVatNumber: company.vatNumber,
        },
      })
      .closed.then((id) => this.changedIf(id));
  }

  protected attach(): void {
    void this.panels
      .open(AttachSubAccountPanel, {
        ...FORM_PANEL,
        data: { parentId: this.company().id, parentName: this.parentName() },
      })
      .closed.then((id) => this.changedIf(id));
  }

  /** Un panneau fermé sans rien créer ne fait pas relire la fiche. */
  private changedIf(result: unknown): void {
    if (typeof result === 'string') {
      this.changed.emit();
    }
  }
}
