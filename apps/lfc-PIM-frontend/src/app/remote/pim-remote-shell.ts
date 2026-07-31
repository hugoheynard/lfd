import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldViewNavComponent } from 'fold-ng';

import { PIM_NAV } from './pim-nav';

/**
 * Layout du PIM **en mode fédéré** : la chrome (header/rail/footer) appartient au
 * shell, donc PIM n'apporte PAS de `fold-app-shell` ici (pas de shell imbriqué —
 * un seul propriétaire du scroll et de la chrome). Il rend juste SON menu dans le
 * content (nav horizontal, donnée `PIM_NAV`) au-dessus de ses pages. En standalone
 * c'est `App` (fold-app-shell + rail) qui joue ce rôle.
 */
@Component({
  selector: 'app-pim-remote-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldViewNavComponent],
  template: `
    <div class="pim-remote">
      <fold-view-nav [items]="nav" />
      <router-outlet />
    </div>
  `,
  styles: `
    .pim-remote {
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      padding: var(--fold-space-md);
    }
  `,
})
export class PimRemoteShell {
  protected readonly nav = PIM_NAV;
}
