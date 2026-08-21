import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  effect,
  inject,
  signal,
} from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
} from 'fold-ng';

import {
  ShopifyChannelApi,
  type ChannelMode,
  type DesiredCollection,
  type Reconciliation,
  type ShopifyCollection,
} from '../../channels/shopify-channel-api';
import { formatPercent } from '../../data/channels';
import { type TvaRegime } from '../../catalogue/catalogue-api';
import { TvaStore } from '../../catalogue/tva-regimes/tva-store';

/** Une ligne : le régime local rapproché de sa collection distante. */
interface TvaCollectionRow {
  readonly regimeId: string;
  readonly name: string;
  readonly percent: number;
  readonly handle: string;
  readonly state: 'present' | 'missing';
  readonly remote: ShopifyCollection | null;
}

interface TvaCollectionsView {
  readonly rows: readonly TvaCollectionRow[];
  readonly orphans: readonly ShopifyCollection[];
  readonly missingCount: number;
}

/**
 * Les **collections de taxe** Shopify (Famille A : `tva-5-5`, `tva-10`,
 * `tva-20`) — inspection de la boutique, et push de celles qui manquent.
 *
 * Vit dans **Publication**, et non plus sous « Régimes de TVA » d'où elle
 * arrive : ce bloc ne décrit pas les taux, il les **pousse**. Logé dans le
 * référentiel, il en faisait un second point d'envoi vers Shopify, appelait le
 * réseau à chaque ouverture d'un écran de lecture, et son état vide affirmait
 * — faux depuis le taux par article — que Shopify était le seul canal branché
 * sur les régimes.
 *
 * Ici, il précède le tableau des produits, qui est son ordre réel : tant que la
 * collection de taxe n'existe pas, aucune fiche ne peut s'y rattacher.
 *
 * Découplée du référentiel : elle relit les régimes depuis le {@link TvaStore}
 * via un `effect`, donc un régime ajouté ailleurs re-déclenche l'inspection.
 */
@Component({
  selector: 'app-publication-tva-collections',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldCalloutComponent, FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './publication-tva-collections.html',
  styleUrl: './publication-tva-collections.scss',
})
export class PublicationTvaCollections {
  private readonly api = inject(ShopifyChannelApi);
  private readonly store = inject(TvaStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly recon = signal<TvaCollectionsView | null>(null);
  protected readonly mode = signal<ChannelMode | null>(null);
  protected readonly inspecting = signal(false);
  protected readonly pushing = signal(false);
  protected readonly lastInspectedAt = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Ré-inspecte dès que le store bouge (régime CRUD) — réseau, donc navigateur seul.
    effect(() => {
      this.store.items();
      if (this.isBrowser) {
        void this.inspect();
      }
    });
  }

  protected format(percent: number): string {
    return formatPercent(percent);
  }

  /** Interroge la boutique : rapproche les régimes et les collections présentes. */
  protected async inspect(): Promise<void> {
    this.inspecting.set(true);
    this.error.set(null);
    try {
      const regimes = this.regimes();
      const result = await this.api.inspectTvaCollections(this.desired(regimes));
      this.mode.set(result.mode);
      this.recon.set(this.toView(result.reconciliation, regimes));
      this.lastInspectedAt.set(nowLabel());
    } catch {
      this.error.set(this.unreachable());
    } finally {
      this.inspecting.set(false);
    }
  }

  /** Pousse toutes les collections de taxe manquantes, puis affiche l'état rendu. */
  protected async pushMissing(): Promise<void> {
    const regimes = this.regimes();
    await this.push(async () => {
      const result = await this.api.pushTvaCollections(this.desired(regimes));
      this.mode.set(result.mode);
      this.recon.set(this.toView(result.reconciliation, regimes));
    });
  }

  /** Pousse la collection d'un seul régime, puis ré-inspecte l'ensemble. */
  protected async pushOne(regimeId: string): Promise<void> {
    const regime = this.regimes().find((r) => r.id === regimeId);
    if (regime === undefined) {
      return;
    }
    await this.push(async () => {
      await this.api.pushTvaCollections([this.desiredOf(regime)]);
      await this.inspect();
    });
  }

  private async push(action: () => Promise<void>): Promise<void> {
    this.pushing.set(true);
    this.error.set(null);
    try {
      await action();
    } catch {
      this.error.set(this.unreachable());
    } finally {
      this.pushing.set(false);
    }
  }

  private regimes(): readonly TvaRegime[] {
    return this.store.items();
  }

  private desired(regimes: readonly TvaRegime[]): DesiredCollection[] {
    return regimes.map((regime) => this.desiredOf(regime));
  }

  private desiredOf(regime: TvaRegime): DesiredCollection {
    return { handle: regime.tag, title: `TVA ${formatPercent(regime.percent)}` };
  }

  /** Joint la réconciliation du backend (par handle) aux régimes locaux. */
  private toView(
    reconciliation: Reconciliation,
    regimes: readonly TvaRegime[],
  ): TvaCollectionsView {
    const rows = regimes.map<TvaCollectionRow>((regime) => {
      const remote = reconciliation.rows.find((row) => row.handle === regime.tag)?.remote ?? null;
      return {
        regimeId: regime.id,
        name: regime.name,
        percent: regime.percent,
        handle: regime.tag,
        state: remote === null ? 'missing' : 'present',
        remote,
      };
    });
    return {
      rows,
      orphans: reconciliation.orphans,
      missingCount: rows.filter((row) => row.state === 'missing').length,
    };
  }

  private unreachable(): string {
    return 'API injoignable — démarrez lfd-api (port 3200).';
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
