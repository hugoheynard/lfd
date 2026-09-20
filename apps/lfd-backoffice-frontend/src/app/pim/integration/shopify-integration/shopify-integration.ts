import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldContextCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldHeroCardComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldSpinnerComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import type { ShopifySettings } from '../../data/models';
import { ShopifyChannelApi, type VerifyResult } from '../../channels/shopify-channel-api';

/** État de connexion résumé pour le badge du hero — un ton + un mot. */
interface ConnectionStatus {
  readonly status: 'success' | 'info' | 'neutral';
  readonly label: string;
}

/**
 * L'intégration **Shopify** — une des pages hébergées par le hub d'intégrations.
 * La connexion (domaine, version, activation) et la vérification passent par le
 * backend ({@link ShopifyChannelApi}) ; les **identifiants** (client credentials ou
 * jeton legacy) restent des secrets d'environnement, jamais saisis ici. Pensée pour
 * vivre dans un panneau d'onglet, sans chrome de page.
 */
@Component({
  selector: 'app-shopify-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldHeroCardComponent,
    FoldContextCardComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldStatusBadgeComponent,
    FoldIconComponent,
    FoldSpinnerComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldElementTitleComponent,
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

  /** Le badge du hero : vert connecté, bleu prêt (mode réel), gris simulation. */
  protected readonly status = computed<ConnectionStatus>(() => {
    if (this.verifyResult()?.connected) {
      return { status: 'success', label: 'Connecté' };
    }
    return this.settings()?.mode === 'live'
      ? { status: 'info', label: 'Prêt' }
      : { status: 'neutral', label: 'Simulation' };
  });

  /** Titre du hero : le nom de la boutique une fois connecté, sinon la marque. */
  protected readonly heroTitle = computed(() => {
    const verify = this.verifyResult();
    return verify?.connected && verify.shopName ? verify.shopName : 'Shopify';
  });

  /** Sous-titre du hero : le domaine si connecté, sinon l'état d'auth courant. */
  protected readonly heroSubtitle = computed(() => {
    const current = this.settings();
    if (current === null) {
      return 'Click & collect — le catalogue descend vers la boutique.';
    }
    if (this.verifyResult()?.connected) {
      return current.shopDomain;
    }
    return current.mode === 'live'
      ? 'Identifiants en place — vérifiez la connexion.'
      : "Mode simulation — aucun appel n'atteint la boutique.";
  });

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
    return 'API injoignable — démarrez lfd-api (port 3200).';
  }
}
