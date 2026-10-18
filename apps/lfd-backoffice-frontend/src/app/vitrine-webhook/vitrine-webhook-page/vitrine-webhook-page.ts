import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { VitrineSubscriberView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { VitrineCredentialsPanel } from '../vitrine-credentials-panel/vitrine-credentials-panel';
import {
  VitrineJournalPanel,
  type VitrineJournalData,
} from '../vitrine-journal-panel/vitrine-journal-panel';
import {
  VitrineSubscriberCard,
  type VitrineSubscriberGesture,
} from '../vitrine-subscriber-card/vitrine-subscriber-card';
import { VitrineSubscriberPanel } from '../vitrine-subscriber-panel/vitrine-subscriber-panel';
import { VitrineWebhookService } from '../vitrine-webhook.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Le webhook de la vitrine** — Gestion Boutique (plan
 * `documentation/webhooks/plan-webhook-vitrine.md`, décision 3 du §5) : les
 * abonnés, ce que chacun reçoit, ses gestes et son journal des envois. Sous
 * `shop_vitrine` ; sans l'écriture, tout se lit et rien ne se change.
 */
@Component({
  selector: 'app-vitrine-webhook-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    VitrineSubscriberCard,
  ],
  templateUrl: './vitrine-webhook-page.html',
  styleUrl: './vitrine-webhook-page.scss',
})
export class VitrineWebhookPage {
  private readonly api = inject(VitrineWebhookService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly canWrite = computed(() => this.permissions.can('shop_vitrine:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly subscribers = signal<readonly VitrineSubscriberView[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.subscribers.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async create(): Promise<void> {
    const ref = this.panels.open(VitrineSubscriberPanel, {});
    if ((await ref.closed) !== undefined) {
      this.notify.success('Abonné créé.');
      await this.load();
    }
  }

  protected async run(
    subscriber: VitrineSubscriberView,
    gesture: VitrineSubscriberGesture,
  ): Promise<void> {
    switch (gesture.kind) {
      case 'journal':
        return this.openJournal(subscriber);
      case 'rotate':
        return this.openRotation(subscriber);
      case 'contents':
        return this.act(
          subscriber,
          () => this.api.setContents(subscriber.id, gesture.contents),
          'Cases enregistrées.',
        );
      case 'active':
        return this.act(
          subscriber,
          () => this.api.setActive(subscriber.id, gesture.active),
          gesture.active ? 'Abonné rallumé.' : 'Abonné coupé : plus rien ne lui part.',
        );
      case 'test':
        return this.act(
          subscriber,
          () => this.api.test(subscriber.id),
          'Essai envoyé : son verdict est au journal des envois.',
        );
      case 'resync':
        return this.act(
          subscriber,
          () => this.api.resync(subscriber.id),
          'Tout repartira au prochain passage, dans cinq minutes au plus.',
        );
    }
  }

  private async openJournal(subscriber: VitrineSubscriberView): Promise<void> {
    const data: VitrineJournalData = { subscriber, canWrite: this.canWrite() };
    await this.panels.open(VitrineJournalPanel, { data }).closed;
    await this.load();
  }

  private async openRotation(subscriber: VitrineSubscriberView): Promise<void> {
    const ref = this.panels.open(VitrineCredentialsPanel, { data: subscriber });
    if ((await ref.closed) !== undefined) {
      this.notify.success('Secret et clé régénérés.');
    }
  }

  private async act(
    subscriber: VitrineSubscriberView,
    gesture: () => Promise<void>,
    done: string,
  ): Promise<void> {
    this.busy.set(subscriber.id);
    this.refusal.set(null);
    try {
      await gesture();
      this.notify.success(done);
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le geste n’a pas abouti.'));
    } finally {
      this.busy.set(null);
    }
  }
}
