import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

/**
 * Réglages **généraux** du PIM. Le catalogue et la publication vivent côté backend
 * (plus de base de démo locale) ; la connexion Shopify vit dans le hub d'intégrations.
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {}
