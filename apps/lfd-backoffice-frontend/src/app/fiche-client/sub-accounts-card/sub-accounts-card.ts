import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SubAccountView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPanelHostService,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import {
  FOLLOW_ASPECT_LABELS,
  STATUS_LABELS,
  type AdminCompanyDetail,
} from '../../comptes-clients/admin-company';
import { FORM_PANEL } from '../informations/fiche-client.panels';
import { AttachSubAccountPanel } from '../panels/attach-sub-account-panel/attach-sub-account-panel';
import { SubAccountPanel } from '../panels/sub-account-panel/sub-account-panel';

/**
 * **Les sous-comptes d'un principal** (`plan-sous-comptes.md` §4) : la liste
 * des enfants (enseigne, ville, statut, aspects suivis), « Créer un
 * sous-compte », « Rattacher un client existant », et la case « Compte de
 * groupe, sans livraison » (R6).
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
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './sub-accounts-card.html',
  styleUrl: './sub-accounts-card.scss',
})
export class SubAccountsCard {
  private readonly service = inject(AdminCompanyHierarchyService);
  private readonly panels = inject(FoldPanelHostService);

  readonly company = input.required<AdminCompanyDetail>();

  /** La hiérarchie a changé : la fiche relit. */
  readonly changed = output<void>();

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly subAccounts = computed(() => this.company().hierarchy.subAccounts);
  protected readonly groupChecked = signal(false);
  protected readonly savingGroup = signal(false);
  protected readonly refusal = signal<string | null>(null);

  private readonly name = computed(() => {
    const company = this.company();
    return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
  });

  constructor() {
    effect(() => {
      const enabled = this.company().hierarchy.groupWithoutDelivery;
      untracked(() => this.groupChecked.set(enabled));
    });
  }

  protected aspectsOf(subAccount: SubAccountView): string {
    return subAccount.followedAspects.map((aspect) => FOLLOW_ASPECT_LABELS[aspect]).join(' · ');
  }

  protected create(): void {
    const company = this.company();
    void this.panels
      .open(SubAccountPanel, {
        ...FORM_PANEL,
        data: {
          parentId: company.id,
          parentName: this.name(),
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
        data: { parentId: this.company().id, parentName: this.name() },
      })
      .closed.then((id) => this.changedIf(id));
  }

  protected async setGroup(enabled: boolean): Promise<void> {
    if (this.savingGroup()) {
      return;
    }
    const previous = this.groupChecked();
    this.groupChecked.set(enabled);
    this.savingGroup.set(true);
    this.refusal.set(null);
    try {
      await this.service.setGroupWithoutDelivery(this.company().id, enabled);
      this.changed.emit();
    } catch (error) {
      this.groupChecked.set(previous);
      this.refusal.set(httpErrorMessage(error, '« Compte de groupe » n’a pas été enregistré.'));
    } finally {
      this.savingGroup.set(false);
    }
  }

  /** Un panneau fermé sans rien créer ne fait pas relire la fiche. */
  private changedIf(result: unknown): void {
    if (typeof result === 'string') {
      this.changed.emit();
    }
  }
}
