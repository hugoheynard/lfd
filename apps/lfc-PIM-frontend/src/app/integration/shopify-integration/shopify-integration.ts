import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import type { ShopifySettings } from '../../data/models';
import { ShopifyChannelApi, type VerifyResult } from '../../channels/shopify-channel-api';

/**
 * L'intégration **Shopify** — une des pages hébergées par le hub d'intégrations.
 * La connexion (domaine, version, activation) et la vérification passent par le
 * backend ({@link ShopifyChannelApi}) ; le jeton reste un secret d'environnement,
 * jamais saisi ici. Pensée pour vivre dans un panneau d'onglet, sans chrome de page.
 */
@Component({
  selector: 'app-shopify-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
  ],
  templateUrl: './shopify-integration.html',
  styleUrl: './shopify-integration.scss',
})
export class ShopifyIntegration {
  private readonly api = inject(ShopifyChannelApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly settings = signal<ShopifySettings | null>(null);
  protected readonly draftDomain = signal('');
  protected readonly draftVersion = signal('');
  protected readonly draftEnabled = signal(false);
  protected readonly verifyResult = signal<VerifyResult | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly verifying = signal(false);

  constructor() {
    // HTTP réel : uniquement dans le navigateur (jamais au rendu SSR).
    if (this.isBrowser) {
      void this.reload();
    }
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    this.error.set(null);
    try {
      const saved = await this.api.saveSettings({
        shopDomain: this.draftDomain(),
        apiVersion: this.draftVersion(),
        isEnabled: this.draftEnabled(),
      });
      this.apply(saved);
      // Les réglages ont changé : l'ancienne vérification ne vaut plus.
      this.verifyResult.set(null);
      this.message.set(
        saved.mode === 'live'
          ? "Enregistré. L'intégration est en mode réel."
          : "Enregistré. L'intégration reste en simulation.",
      );
    } catch {
      this.error.set(this.unreachable());
    } finally {
      this.busy.set(false);
    }
  }

  /** Bouton « Vérifier la connexion » — interroge la boutique via le backend. */
  protected async verify(): Promise<void> {
    this.verifying.set(true);
    this.error.set(null);
    try {
      this.verifyResult.set(await this.api.verify());
    } catch {
      this.error.set(this.unreachable());
    } finally {
      this.verifying.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.apply(await this.api.getSettings());
    } catch {
      this.error.set(this.unreachable());
    }
  }

  private apply(value: ShopifySettings): void {
    this.settings.set(value);
    this.draftDomain.set(value.shopDomain);
    this.draftVersion.set(value.apiVersion);
    this.draftEnabled.set(value.isEnabled);
  }

  private unreachable(): string {
    return 'Backend PIM injoignable — démarrez lfc-PIM-backend (port 3100).';
  }
}
