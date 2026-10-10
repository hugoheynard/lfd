import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import type { DeadLetterView, DeadLettersView } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { OpsService } from '../ops.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * Les messages morts de la boîte d'envoi
 * (`documentation/journalisation/plan-boite-d-envoi.md`, §9 bis) : chaque couple
 * message × abonné qui a épuisé ses essais, et le geste « Rejouer ».
 *
 * Vide, la section le DIT au lieu de disparaître : un zéro qu'on voit est une
 * mesure, un zéro qu'on ne voit pas est un oubli.
 */
@Component({
  selector: 'app-dead-letters',
  imports: [
    DatePipe,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './dead-letters.html',
  styleUrl: './dead-letters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeadLetters {
  private readonly ops = inject(OpsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<DeadLettersView | null>(null);
  /** La clé du couple en cours de rejeu — un seul à la fois. */
  protected readonly replaying = signal<string | null>(null);

  protected readonly canReplay = computed(() => this.permissions.can('ops_health:write'));
  protected readonly letters = computed(() => this.view()?.letters ?? []);

  constructor() {
    void this.load();
  }

  protected rowKey(letter: DeadLetterView): string {
    return `${letter.eventId}|${letter.subscriber}`;
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.ops.deadLetters());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async replay(letter: DeadLetterView): Promise<void> {
    this.replaying.set(this.rowKey(letter));
    try {
      await this.ops.replay(letter.eventId, letter.subscriber);
      this.notify.success(`Message rejoué pour ${letter.subscriber}.`);
      await this.refresh();
    } catch (error) {
      this.notify.error(error, 'Le rejeu a échoué.');
    } finally {
      this.replaying.set(null);
    }
  }

  /** Relit sans repasser par l'état de chargement : la liste reste à l'écran. */
  private async refresh(): Promise<void> {
    try {
      this.view.set(await this.ops.deadLetters());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
