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
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';

/**
 * **« Compte de groupe, sans livraison »** (`sous-comptes.md` §4, R6) — sous
 * l'identité, dans Informations.
 *
 * Un bouton et une confirmation, pas une case : activer retire au compte la
 * capacité de commander pour lui-même, et la confirmation le dit (Hugo,
 * 2026-10-20).
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
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './group-account-card.html',
  styleUrl: './group-account-card.scss',
})
export class GroupAccountCard {
  private readonly service = inject(AdminCompanyHierarchyService);

  readonly company = input.required<AdminCompanyDetail>();

  /** Le réglage a changé : la fiche relit (les exigences d'activation en dépendent). */
  readonly changed = output<void>();

  protected readonly checked = signal(false);
  protected readonly confirming = signal(false);

  /**
   * Ce que le geste CHANGE, dit avant de le faire (Hugo, 2026-10-20) : activer
   * retire au compte la capacité de commander pour lui-même.
   */
  protected readonly confirmMessage = computed(() =>
    this.checked()
      ? 'Repasser ce compte en compte qui commande ? Il pourra de nouveau commander pour lui-même ; son activation exigera alors une adresse de livraison et une préférence d’acheminement.'
      : 'Transformer ce compte en holding ? Il ne pourra plus commander pour lui-même : aucune commande ne sera acceptée à son nom. Il négocie pour ses sous-comptes, et son activation n’exigera ni adresse de livraison ni préférence d’acheminement.',
  );
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  constructor() {
    effect(() => {
      const enabled = this.company().hierarchy.groupWithoutDelivery;
      untracked(() => this.checked.set(enabled));
    });
  }

  /** Bascule l'état enregistré, une fois confirmé. */
  protected async apply(): Promise<void> {
    if (this.saving()) {
      return;
    }
    const enabled = !this.checked();
    const previous = this.checked();
    this.checked.set(enabled);
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.setGroupWithoutDelivery(this.company().id, enabled);
      this.confirming.set(false);
      this.changed.emit();
    } catch (error) {
      this.checked.set(previous);
      this.refusal.set(httpErrorMessage(error, '« Compte de groupe » n’a pas été enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }
}
