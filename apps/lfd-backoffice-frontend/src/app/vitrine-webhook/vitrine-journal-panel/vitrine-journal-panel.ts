import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { VitrineDeliveryView, VitrineSubscriberView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { VitrineWebhookService } from '../vitrine-webhook.service';
import {
  DELIVERY_STATE_LABELS,
  DELIVERY_STATE_VARIANTS,
  deliverySummary,
  deliveryTitle,
} from '../vitrine-webhook-format';

/** Le journal d'un abonné ; les gestes seulement avec le droit d'écrire. */
export interface VitrineJournalData {
  readonly subscriber: VitrineSubscriberView;
  readonly canWrite: boolean;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le journal des envois** d'un abonné (W7) : livré, en attente, en échec —
 * et pourquoi. « Renvoyer » remet un envoi en attente ; « Tout renvoyer » lève
 * l'échec et renvoie tout au prochain passage du cron (cinq minutes au plus).
 */
@Component({
  selector: 'app-vitrine-journal-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './vitrine-journal-panel.html',
  styleUrl: './vitrine-journal-panel.scss',
})
export class VitrineJournalPanel implements FoldPanelContent<VitrineJournalData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'lg', surface: 'solid' };

  readonly data = input.required<VitrineJournalData>();

  private readonly api = inject(VitrineWebhookService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly stateLabels = DELIVERY_STATE_LABELS;
  protected readonly stateVariants = DELIVERY_STATE_VARIANTS;
  protected readonly summary = deliverySummary;
  protected readonly title = deliveryTitle;
  protected readonly state = signal<LoadState>('loading');
  protected readonly deliveries = signal<readonly VitrineDeliveryView[]>([]);
  protected readonly pending = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      this.data();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.deliveries.set(await this.api.deliveries(this.data().subscriber.id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected resend(delivery: VitrineDeliveryView): Promise<void> {
    return this.act(
      () => this.api.resend(delivery.id),
      'Remis en attente : il repartira au prochain passage, dans cinq minutes au plus.',
    );
  }

  protected resyncAll(): Promise<void> {
    return this.act(
      () => this.api.resync(this.data().subscriber.id),
      'Tout repartira en une notification au prochain passage, dans cinq minutes au plus.',
    );
  }

  protected close(): void {
    this.panel.close(undefined);
  }

  private async act(gesture: () => Promise<void>, done: string): Promise<void> {
    this.pending.set(true);
    this.refusal.set(null);
    this.notice.set(null);
    try {
      await gesture();
      this.notice.set(done);
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le geste n’a pas abouti.'));
    } finally {
      this.pending.set(false);
    }
  }
}
