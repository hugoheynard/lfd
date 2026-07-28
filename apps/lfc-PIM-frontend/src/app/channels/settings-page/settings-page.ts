import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { LocalDb } from '../../data/local-db';

/**
 * Réglages **généraux** du PIM. Aujourd'hui la base de démo (POC LocalDb) et sa
 * remise à zéro ; la connexion Shopify vit désormais dans le hub d'intégrations.
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly db = inject(LocalDb);

  protected readonly message = signal<string | null>(null);

  protected reset(): void {
    this.db.reset();
    this.message.set("Base de démo réinitialisée à l'état d'origine.");
  }
}
