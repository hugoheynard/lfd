import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { ClientPreferences } from '../../../client-preferences.service';
import { ClientCopyService } from '../../../copy/client-copy.service';

/**
 * La carte **Préférences** du bureau : l'habitude de service et la langue, et
 * la règle des notifications.
 *
 * ⚠️ Ses deux « Modifier » en ligne n'ont **aucune action**, et c'est leur état
 * d'origine (vérifié le 2026-09-14 sur `compte-page.html` à `HEAD`). Rétablis
 * tels quels : aucun geste du bureau ne disparaît avec ce lot.
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
}
