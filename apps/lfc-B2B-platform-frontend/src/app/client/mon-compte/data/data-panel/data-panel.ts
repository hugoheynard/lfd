import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';
import { ClientFeatureAccess } from '../../../feature-access/client-feature-access.service';
import { panelSide } from '../../../panel-side';

/**
 * Le panneau **Mes données** — ce qu'on garde, et les deux gestes
 * irréversibles, chacun avec sa conséquence énoncée.
 *
 * ⚠️ **Ses quatre boutons n'ont aucune action**, et c'est leur état d'origine
 * (vérifié le 2026-09-14 sur `data-card.html` à `HEAD` : aucun `(click)`, et
 * aucune route client d'export, de transfert ni de fermeture). Ils sont là à
 * la demande de Hugo, comme sur la carte bureau ; les brancher est un chantier.
 */
@Component({
  selector: 'app-data-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './data-panel.html',
  styleUrl: './data-panel.scss',
})
export class DataPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService): void {
    panels.open(DataPanel, { side: panelSide() });
  }

  protected readonly t = inject(ClientCopyService).t;
  protected readonly access = inject(ClientFeatureAccess);
}
