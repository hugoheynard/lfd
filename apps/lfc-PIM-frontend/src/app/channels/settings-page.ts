import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';

import { ShopifyApi, type ShopifySettings } from './shopify-api';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <header class="page-head">
      <h1>Réglages — Shopify</h1>
      <p>
        Le catalogue descend vers la boutique. Rien ne remonte : les commandes et les
        ventes se lisent, elles ne se réécrivent pas ici.
      </p>
    </header>

    @if (settings(); as current) {
      <section class="panel">
        <div class="mode" [class.live]="current.mode === 'live'">
          @if (current.mode === 'live') {
            <strong>Mode réel</strong>
            <span>Les envois atteignent la boutique.</span>
          } @else {
            <strong>Mode simulation</strong>
            <span>
              La chaîne complète s’exécute — lecture, projection, empreinte — mais
              <em>aucun appel réseau</em> n’est émis.
            </span>
          }
        </div>

        <label>
          <span>Domaine de la boutique</span>
          <input
            type="text"
            placeholder="chevallot.myshopify.com"
            [value]="draftDomain()"
            (input)="draftDomain.set(inputValue($event))"
          />
        </label>

        <label>
          <span>Version d’API</span>
          <input
            type="text"
            [value]="draftVersion()"
            (input)="draftVersion.set(inputValue($event))"
          />
          <small>Shopify publie une version par trimestre — à relever à chaque montée.</small>
        </label>

        <label class="check">
          <input
            type="checkbox"
            [checked]="draftEnabled()"
            (change)="draftEnabled.set(checkedValue($event))"
          />
          <span>Intégration active</span>
        </label>

        <div class="token" [class.missing]="!current.hasToken">
          <span>Jeton d’API</span>
          @if (current.hasToken) {
            <strong>présent</strong>
          } @else {
            <strong>absent</strong>
          }
          <small>
            Le jeton est un secret : il vit dans la variable d’environnement
            <code>SHOPIFY_ADMIN_TOKEN</code>, jamais en base et jamais affiché ici. Sans
            lui, l’intégration reste en simulation même activée.
          </small>
        </div>

        <div class="actions">
          <button type="button" (click)="save()" [disabled]="busy()">Enregistrer</button>
          @if (current.updatedAt) {
            <small>Modifié le {{ current.updatedAt | date: 'short' }}</small>
          }
        </div>
      </section>
    }

    @if (message(); as text) {
      <p class="notice" role="status">{{ text }}</p>
    }
  `,
  styleUrl: '../catalogue/catalogue.scss',
  styles: [
    `
      .panel {
        display: grid;
        gap: 1.1rem;
        max-width: 40rem;
        padding: 1.25rem;
        background: var(--fold-color-surface-card);
        border: 1px solid var(--fold-color-border);
        border-radius: 0.6rem;
      }
      label {
        display: grid;
        gap: 0.3rem;
        font-size: 0.9rem;
      }
      label.check {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      label.check input {
        width: auto;
      }
      small {
        color: var(--fold-color-text-muted);
        font-size: 0.8rem;
      }
      .mode {
        display: grid;
        gap: 0.2rem;
        padding: 0.7rem 0.85rem;
        border-radius: 0.45rem;
        background: var(--fold-color-surface-sunken);
        border-left: 3px solid var(--fold-color-text-muted);
        font-size: 0.85rem;
      }
      .mode.live {
        border-left-color: var(--fold-color-primary);
      }
      .token {
        display: grid;
        gap: 0.2rem;
        padding: 0.7rem 0.85rem;
        border-radius: 0.45rem;
        background: var(--fold-color-surface-sunken);
        font-size: 0.85rem;
      }
      .token.missing strong {
        color: var(--fold-color-alert);
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .notice {
        margin-top: 1rem;
        color: var(--fold-color-text-muted);
        font-size: 0.9rem;
      }
    `,
  ],
})
export class SettingsPage {
  private readonly api = inject(ShopifyApi);

  protected readonly settings = signal<ShopifySettings | null>(null);
  protected readonly draftDomain = signal('');
  protected readonly draftVersion = signal('');
  protected readonly draftEnabled = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    void this.reload();
  }

  protected inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ? target.value : '';
  }

  protected checkedValue(event: Event): boolean {
    const target = event.target;
    return target instanceof HTMLInputElement ? target.checked : false;
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
    } catch {
      this.message.set('Enregistrement impossible : le serveur est injoignable.');
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.apply(await this.api.readSettings());
    } catch {
      this.message.set('Réglages illisibles : le serveur est injoignable.');
    }
  }

  private apply(value: ShopifySettings): void {
    this.settings.set(value);
    this.draftDomain.set(value.shopDomain);
    this.draftVersion.set(value.apiVersion);
    this.draftEnabled.set(value.isEnabled);
  }
}
