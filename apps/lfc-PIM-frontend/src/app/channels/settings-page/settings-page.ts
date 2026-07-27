import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { LocalDb } from '../../data/local-db';
import { ShopifyApi, type ShopifySettings } from '../shopify-api';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
  ],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly api = inject(ShopifyApi);
  private readonly db = inject(LocalDb);

  protected readonly settings = signal<ShopifySettings | null>(null);
  protected readonly draftDomain = signal('');
  protected readonly draftVersion = signal('');
  protected readonly draftEnabled = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    void this.reload();
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      const saved = await this.api.saveSettings({
        shopDomain: this.draftDomain(),
        apiVersion: this.draftVersion(),
        isEnabled: this.draftEnabled(),
      });
      this.apply(saved);
      this.message.set(
        saved.mode === 'live'
          ? 'Enregistré. L’intégration est en mode réel.'
          : 'Enregistré. L’intégration reste en simulation.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected reset(): void {
    this.db.reset();
    void this.reload();
    this.message.set('Base réinitialisée à l’état d’origine.');
  }

  private async reload(): Promise<void> {
    this.apply(await this.api.readSettings());
  }

  private apply(value: ShopifySettings): void {
    this.settings.set(value);
    this.draftDomain.set(value.shopDomain);
    this.draftVersion.set(value.apiVersion);
    this.draftEnabled.set(value.isEnabled);
  }
}
