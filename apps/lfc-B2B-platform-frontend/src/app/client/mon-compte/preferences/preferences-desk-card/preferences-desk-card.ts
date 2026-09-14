import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientPreferences } from '../../../client-preferences.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { PreferencesPanel } from '../preferences-panel/preferences-panel';
import { canEditPreferences } from '../preferences-section';

/**
 * La carte **Préférences** du bureau : l'habitude de service et la langue, et
 * la règle des notifications.
 *
 * Ses deux « Modifier » en ligne n'avaient **aucune action** jusqu'au
 * 2026-09-14. Ils ouvrent désormais le panneau : l'habitude aux rôles que
 * l'API laisse écrire (le bouton est absent pour les autres), la langue à tout
 * le monde — elle ne touche pas la société.
 */
@Component({
  selector: 'app-preferences-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './preferences-desk-card.html',
  styleUrl: './preferences-desk-card.scss',
})
export class PreferencesDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly preferences = inject(ClientPreferences);
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly canEdit = computed(() => canEditPreferences(this.client.company()));

  protected open(): void {
    PreferencesPanel.open(this.panels, this.client.company());
  }
}
