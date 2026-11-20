import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SubAccountMenuSummary } from '@lfd/contracts';
import { FoldBadgeComponent } from 'fold-ng';

import { menuIndicator } from '../carte/sub-account-menu-draft';

/**
 * **Ce que la liste des sites d'un principal dit de la carte d'un site**
 * (`plan-carte-des-sites.md`, § 5) : « Carte : liste blanche, 3 entrées », ou
 * rien sans carte. Le résumé vient avec la hiérarchie (`SubAccountView.menu`) :
 * aucune lecture par site.
 */
@Component({
  selector: 'app-sub-account-menu-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './sub-account-menu-indicator.html',
})
export class SubAccountMenuIndicator {
  readonly menu = input.required<SubAccountMenuSummary | null>();

  protected readonly label = computed(() => menuIndicator(this.menu()));
}
