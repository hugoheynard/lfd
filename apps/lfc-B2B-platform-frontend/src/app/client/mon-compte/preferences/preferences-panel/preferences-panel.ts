import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientPreferences } from '../../../client-preferences.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';

/**
 * Le panneau **Préférences** — l'habitude de service et la langue, en lecture,
 * avec la règle des notifications.
 *
 * 🔴 Les deux « Modifier » de la carte d'avant sont partis : ils n'ouvraient
 * rien. Un réglage qui ne se règle pas est pire qu'un réglage absent — on
 * croit l'avoir posé.
 */
@Component({
  selector: 'app-preferences-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './preferences-panel.html',
  styleUrl: './preferences-panel.scss',
})
export class PreferencesPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService): void {
    panels.open(PreferencesPanel, { side: panelSide() });
  }

  protected readonly t = inject(ClientCopyService).t;
  protected readonly preferences = inject(ClientPreferences);
}
