import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldNavLayoutComponent,
  FoldPageSectionComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { formatPercent } from '../../../data/channels';
import { LocalDb } from '../../../data/local-db';
import {
  CatalogueApi,
  type TvaReconciliation,
} from '../../catalogue-api';

/**
 * Les **usages plateforme** d'un régime de TVA : comment ses collections de taxe
 * (Famille A) se rapprochent des consommateurs du catalogue. Aujourd'hui un seul
 * canal — Shopify — dans un onglet de réconciliation ; les autres viendront.
 *
 * Découplée du tableau : elle relit la réconciliation depuis {@link LocalDb} via
 * un `effect`, donc un régime ajouté / retiré ailleurs (ou une collection
 * poussée ici) re-déclenche l'inspection sans câblage entre composants.
 */
@Component({
  selector: 'app-tva-regime-platform-usages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './tva-regime-platform-usages.html',
  styleUrl: './tva-regime-platform-usages.scss',
})
export class TvaRegimePlatformUsages {
  private readonly api = inject(CatalogueApi);
  private readonly db = inject(LocalDb);

  protected readonly tabs: FoldTabItem[] = [
    { key: 'shopify', label: 'Shopify', icon: 'shopify' },
    { key: 'autre', label: 'Autre', icon: 'grid' },
  ];
  protected readonly activeTab = signal('shopify');

  protected readonly recon = signal<TvaReconciliation | null>(null);
  protected readonly inspecting = signal(false);
  protected readonly pushing = signal(false);
  protected readonly lastInspectedAt = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Relit la boutique dès que la DB bouge (régime CRUD, push) : l'inspection
    // reste alignée sans que le tableau ait à nous prévenir.
    effect(() => {
      this.db.snapshot();
      void this.inspect();
    });
  }

  protected format(percent: number): string {
    return formatPercent(percent);
  }

  /** Interroge la boutique : rapproche les régimes et les collections présentes. */
  protected async inspect(): Promise<void> {
    this.inspecting.set(true);
    try {
      this.recon.set(await this.api.inspectTvaCollections());
      this.lastInspectedAt.set(nowLabel());
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.inspecting.set(false);
    }
  }

  /** Pousse toutes les collections de taxe manquantes (l'effect ré-inspecte). */
  protected async pushMissing(): Promise<void> {
    await this.push(() => this.api.pushMissingTvaCollections());
  }

  /** Pousse la collection d'un seul régime (l'effect ré-inspecte). */
  protected async pushOne(regimeId: string): Promise<void> {
    await this.push(() => this.api.pushTvaCollection(regimeId));
  }

  private async push(action: () => Promise<unknown>): Promise<void> {
    this.pushing.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.pushing.set(false);
    }
  }
}

/** Heure locale « 14:32:05 » — l'horodatage de la dernière inspection. */
function nowLabel(): string {
  return new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
