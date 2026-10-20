import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';

/**
 * **« Compte de groupe, sans livraison »** (`sous-comptes.md` §4, R6) — sous
 * l'identité, dans Informations.
 *
 * Elle vivait dans la carte des sous-comptes jusqu'au 2026-10-20 ; Hugo l'a
 * ramenée ici, parce qu'elle dit ce qu'EST le compte (une holding qui négocie
 * et ne commande pas) et change ce que son activation exige — rien à voir avec
 * la liste de ses sites. Posée seulement sur un compte sans principal : un
 * sous-compte ne peut pas être un compte de groupe.
 */
@Component({
  selector: 'app-group-account-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './group-account-card.html',
})
export class GroupAccountCard {
  private readonly service = inject(AdminCompanyHierarchyService);

  readonly company = input.required<AdminCompanyDetail>();

  /** Le réglage a changé : la fiche relit (les exigences d'activation en dépendent). */
  readonly changed = output<void>();

  protected readonly checked = signal(false);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  constructor() {
    effect(() => {
      const enabled = this.company().hierarchy.groupWithoutDelivery;
      untracked(() => this.checked.set(enabled));
    });
  }

  protected async set(enabled: boolean): Promise<void> {
    if (this.saving()) {
      return;
    }
    const previous = this.checked();
    this.checked.set(enabled);
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.setGroupWithoutDelivery(this.company().id, enabled);
      this.changed.emit();
    } catch (error) {
      this.checked.set(previous);
      this.refusal.set(httpErrorMessage(error, '« Compte de groupe » n’a pas été enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }
}
