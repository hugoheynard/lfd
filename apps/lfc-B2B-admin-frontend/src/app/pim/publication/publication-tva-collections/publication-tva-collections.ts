import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import {
  ShopifyChannelApi,
  type ChannelMode,
  type Reconciliation,
  type ShopifyCollection,
} from '../../channels/shopify-channel-api';

/** Une ligne : la collection voulue rapprochée de sa contrepartie distante. */
interface TvaCollectionRow {
  readonly handle: string;
  readonly title: string;
  readonly state: 'present' | 'missing';
  readonly remote: ShopifyCollection | null;
}

interface TvaCollectionsView {
  readonly rows: readonly TvaCollectionRow[];
  readonly orphans: readonly ShopifyCollection[];
  readonly missingCount: number;
}

/**
 * Les **collections de taxe** Shopify (`tva-5-5`, `tva-10`, `tva-20`) — l'état
 * de la boutique, et le rattrapage quand elle a divergé.
 *
 * Vit dans **Publication**, et non plus sous « Taux de TVA » d'où elle
 * arrive : ce bloc ne décrit pas les taux, il regarde ce que la boutique en a
 * fait. Logé dans le référentiel, il en faisait un second point d'envoi vers
 * Shopify, et son état vide affirmait — faux depuis le taux par article — que
 * Shopify était le seul canal branché sur les taux.
 *
 * Il **ne dérive plus rien** : le serveur calcule les collections voulues à
 * partir du référentiel, et la publication des produits crée d'elle-même celles
 * qui manquent. Ce qui reste ici est un miroir, plus une étape.
 */
@Component({
  selector: 'app-publication-tva-collections',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './publication-tva-collections.html',
  styleUrl: './publication-tva-collections.scss',
})
export class PublicationTvaCollections {
  private readonly api = inject(ShopifyChannelApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly recon = signal<TvaCollectionsView | null>(null);
  protected readonly mode = signal<ChannelMode | null>(null);
  protected readonly inspecting = signal(false);
  protected readonly pushing = signal(false);
  protected readonly lastInspectedAt = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Une inspection à l'ouverture — réseau, donc navigateur seul. Elle ne suit
    // plus le référentiel : celui-ci vit derrière la permission `tax`, et cet
    // écran n'a plus besoin de le lire pour dire ce que la boutique contient.
    if (this.isBrowser) {
      void this.inspect();
    }
  }

  /** Interroge la boutique : rapproche les collections voulues et les présentes. */
  protected async inspect(): Promise<void> {
    this.inspecting.set(true);
    this.error.set(null);
    try {
      const result = await this.api.inspectTvaCollections();
      this.mode.set(result.mode);
      this.recon.set(toView(result.reconciliation));
      this.lastInspectedAt.set(nowLabel());
    } catch {
      this.error.set(this.unreachable());
    } finally {
      this.inspecting.set(false);
    }
  }

  /** Rattrapage : crée toutes les collections manquantes, puis affiche l'état rendu. */
  protected async pushMissing(): Promise<void> {
    this.pushing.set(true);
    this.error.set(null);
    try {
      const result = await this.api.pushTvaCollections();
      this.mode.set(result.mode);
      this.recon.set(toView(result.reconciliation));
      this.lastInspectedAt.set(nowLabel());
    } catch {
      this.error.set(this.unreachable());
    } finally {
      this.pushing.set(false);
    }
  }

  private unreachable(): string {
    return 'API injoignable — démarrez lfd-api (port 3200).';
  }
}

/** Le rapprochement du serveur, mis à la forme que le gabarit attend. */
function toView(reconciliation: Reconciliation): TvaCollectionsView {
  const rows = reconciliation.rows.map<TvaCollectionRow>((row) => ({
    handle: row.handle,
    title: row.title,
    state: row.present ? 'present' : 'missing',
    remote: row.remote,
  }));
  return {
    rows,
    orphans: reconciliation.orphans,
    missingCount: rows.filter((row) => row.state === 'missing').length,
  };
}

/** Heure locale « 14:32:05 » — l'horodatage de la dernière inspection. */
function nowLabel(): string {
  return new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
