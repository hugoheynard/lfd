import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProductionAutomaticCloseView, ProductionSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { parisToday } from '../../shared/paris-today';
import { DossierRecipientsCard } from '../dossier-recipients-card/dossier-recipients-card';
import { ProductionSettingsService } from '../production-settings.service';
import { dayLabelOf } from '../worksheet-day';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: ProductionSettingsView };

const DAY_BEFORE = 1;
const SAME_DAY = 0;

/** « 23 h », « 23 h 30 » — l'heure comme l'équipe la dit. */
function spokenTime(time: string): string {
  const [hours = '', minutes = ''] = time.split(':');
  const hour = String(Number(hours));
  return minutes === '00' ? `${hour} h` : `${hour} h ${minutes}`;
}

/**
 * « la veille, 23 h (rattrapage compris) », « le jour même, 0 h 30 (…) » —
 * l'arrêt automatique tel que l'heure limite générale le fixe.
 */
export function automaticCloseLabel(close: ProductionAutomaticCloseView): string {
  const when =
    close.daysBefore === DAY_BEFORE
      ? 'la veille'
      : close.daysBefore === SAME_DAY
        ? 'le jour même'
        : `${String(close.daysBefore)} jours avant`;
  return `${when}, ${spokenTime(close.time)} (rattrapage compris)`;
}

/**
 * **Production › Réglages** (plan `documentation/production/arret-du-plan.md`,
 * Q6 ; lot A1) — quand le plan du lendemain s'arrête, et les jours où le
 * fournil ne produit pas.
 *
 * L'arrêt ne se règle plus ici (Hugo, 2026-10-21 —
 * `limites-de-commande/plan-une-seule-heure.md` §5) : il tombe à l'heure
 * limite générale, rattrapage compris, et la page le dit en lecture avec le
 * lien vers Réglages › Commandes › Heure limite. Plus de mode, plus d'heure
 * d'alerte.
 *
 * Sans `production_settings:write`, tout est en lecture seule : le serveur
 * refuserait de toute façon, et un champ qui promet une écriture refusée
 * ressemble à une panne.
 */
@Component({
  selector: 'app-production-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DossierRecipientsCard,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './production-settings-page.html',
  styleUrl: './production-settings-page.scss',
})
export class ProductionSettingsPage {
  private readonly api = inject(ProductionSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('production_settings:write'));

  protected readonly state = signal<LoadState>({ status: 'loading' });

  protected readonly newDay = signal('');
  protected readonly dayBusy = signal(false);
  protected readonly dayRefusal = signal<string | null>(null);

  protected readonly today = parisToday();

  private readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  /** « la veille, 23 h (rattrapage compris) », ou `null` sans heure limite posée. */
  protected readonly automaticClose = computed(() => {
    const close = this.view()?.automaticClose ?? null;
    return close === null ? null : automaticCloseLabel(close);
  });

  protected readonly closedDays = computed(() =>
    (this.view()?.closedDays ?? []).map((date) => ({ date, label: dayLabelOf(date) })),
  );

  protected readonly canAddDay = computed(
    () =>
      this.canWrite() &&
      !this.dayBusy() &&
      /^\d{4}-\d{2}-\d{2}$/u.test(this.newDay()) &&
      this.newDay() >= this.today &&
      !(this.view()?.closedDays ?? []).includes(this.newDay()),
  );

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected async addDay(): Promise<void> {
    if (!this.canAddDay()) {
      return;
    }
    await this.dayGesture(async () => {
      await this.api.addClosedDay(this.newDay());
      this.newDay.set('');
    });
  }

  protected async removeDay(date: string): Promise<void> {
    if (!this.canWrite() || this.dayBusy()) {
      return;
    }
    await this.dayGesture(() => this.api.removeClosedDay(date));
  }

  private async dayGesture(gesture: () => Promise<void>): Promise<void> {
    this.dayBusy.set(true);
    this.dayRefusal.set(null);
    try {
      await gesture();
      await this.load();
    } catch (error) {
      this.dayRefusal.set(httpErrorMessage(error, 'Le jour n’a pas pu être enregistré.'));
    } finally {
      this.dayBusy.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      const view = await this.api.settings();
      this.state.set({ status: 'ready', view });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
