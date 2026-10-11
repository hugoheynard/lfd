import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldMeterComponent,
} from 'fold-ng';

import type { MediaThresholdState, MediaThresholdsReport } from '@lfd/ops-contract';

import { OpsService } from '../ops.service';

type LoadState = 'loading' | 'error' | 'ready';

type Tone = 'success' | 'warning' | 'alert';

/** L'état, en couleur sémantique : le jugement vient du serveur, l'écran ne fait que le dire. */
const TONE: Readonly<Record<MediaThresholdState, Tone>> = {
  ok: 'success',
  attention: 'warning',
  exceeded: 'alert',
};

const LABEL: Readonly<Record<MediaThresholdState, string>> = {
  ok: 'OK',
  attention: 'Attention',
  exceeded: 'Dépassé',
};

/**
 * Les seuils de la médiathèque (`documentation/ops/cloudflare-images.md`,
 * « Les seuils qu'on surveille ») : le fonds face au tri par emplois, à la
 * frise des couleurs et au palier gratuit de Cloudflare Images.
 *
 * Lu une fois à l'ouverture, pas à chaque rafraîchissement de la carte : le
 * fonds grossit d'une image à la fois.
 */
@Component({
  selector: 'app-media-thresholds',
  imports: [
    DecimalPipe,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldMeterComponent,
  ],
  templateUrl: './media-thresholds.html',
  styleUrl: './media-thresholds.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaThresholds {
  private readonly ops = inject(OpsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly report = signal<MediaThresholdsReport | null>(null);
  protected readonly tone = (state: MediaThresholdState): Tone => TONE[state];
  protected readonly label = (state: MediaThresholdState): string => LABEL[state];

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.report.set(await this.ops.mediaThresholds());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
