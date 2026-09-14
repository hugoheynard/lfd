import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { UsersList } from '../users-list/users-list';

/**
 * Le panneau **Utilisateurs** — la liste que la carte mobile ne fait que
 * résumer. C'est la même liste que la carte bureau (`UsersList`) : une
 * personne s'y ouvre de la même façon, où qu'on la lise.
 */
@Component({
  selector: 'app-users-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, UsersList],
  templateUrl: './users-panel.html',
  styleUrl: './users-panel.scss',
})
export class UsersPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService): void {
    panels.open(UsersPanel, { side: panelSide() });
  }

  protected readonly t = inject(ClientCopyService).t;
}
