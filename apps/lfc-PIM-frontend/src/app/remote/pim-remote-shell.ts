import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldViewNavComponent } from 'fold-ng';

import { PIM_NAV } from './pim-nav';

/**
 * Layout du PIM **en mode fédéré** : la chrome (header/footer) appartient au
 * shell, donc PIM n'apporte PAS de `fold-app-shell` ici (pas de shell imbriqué —
 * un seul propriétaire du scroll et de la chrome). Il rend SON menu comme un
 * **second rail vertical** à gauche du content (à droite du rail switcher du
 * shell) — layout deux-rails façon SH3PHERD. En standalone c'est `App`
 * (fold-app-shell + rail) qui joue ce rôle.
 */
@Component({
  selector: 'app-pim-remote-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldViewNavComponent],
  template: `
    <div class="pim-remote">
      <nav class="pim-rail" aria-label="Menu PIM">
        <fold-view-nav [items]="nav" direction="vertical" />
      </nav>
      <div class="pim-content">
        <router-outlet />
      </div>
    </div>
  `,
  styles: `
    .pim-remote {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      min-height: 100%;
      min-width: 0;
    }
    .pim-rail {
      flex: 0 0 auto;
      width: 13.5rem;
      padding: var(--fold-space-md);
      border-right: 1px solid var(--fold-color-border);
      background: color-mix(in srgb, var(--fold-color-primary) 4%, var(--fold-color-bg-page));
    }
    .pim-content {
      flex: 1 1 auto;
      min-width: 0;
      padding: var(--fold-space-lg);
    }
  `,
})
export class PimRemoteShell {
  protected readonly nav = PIM_NAV;
}
