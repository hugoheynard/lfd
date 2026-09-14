import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientPreferences } from '../../../client-preferences.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { PreferencesPanel } from '../preferences-panel/preferences-panel';

/** La carte **Préférences** en pile : l'habitude et la langue, une ligne chacune. */
@Component({
  selector: 'app-preferences-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot],
  templateUrl: './preferences-mobile-card.html',
  styleUrl: './preferences-mobile-card.scss',
})
export class PreferencesMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly preferences = inject(ClientPreferences);
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected open(): void {
    PreferencesPanel.open(this.panels, this.client.company());
  }
}
