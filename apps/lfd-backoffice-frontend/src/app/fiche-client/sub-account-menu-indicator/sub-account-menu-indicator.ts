import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SiteMenuStanding, SubAccountMenuSummary } from '@lfd/contracts';
import { FoldBadgeComponent } from 'fold-ng';

import { menuIndicator } from '../carte/sub-account-menu-draft';

/**
 * **Ce que la liste des sites d'un principal dit de la carte d'un site**
 * (`carte-des-sites.md`, § 2, § 6) : « Carte commune : liste noire, 2 entrées »,
 * « Carte propre : liste blanche, 3 entrées », ou rien sans carte. L'état et le
 * résumé viennent avec la hiérarchie (`SubAccountView.menuState`, `.menu`) :
 * aucune lecture par site.
 */
@Component({
  selector: 'app-sub-account-menu-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './sub-account-menu-indicator.html',
})
export class SubAccountMenuIndicator {
  readonly state = input.required<SiteMenuStanding>();
  readonly menu = input.required<SubAccountMenuSummary | null>();

  protected readonly label = computed(() => menuIndicator(this.state(), this.menu()));
}
