import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  ProductionCloseMode,
  ProductionLatestOrderCutoffView,
  ProductionSettingsView,
} from '@lfd/contracts';
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
  FoldTimeComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { parisToday } from '../../shared/paris-today';
import { DossierRecipientsCard } from '../dossier-recipients-card/dossier-recipients-card';
import { ProductionSettingsService } from '../production-settings.service';
import { dayLabelOf } from '../worksheet-day';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: ProductionSettingsView };

/** Les bornes que l'agrégat tient (plan, S4) ; rappelées, pas revérifiées. */
const EARLIEST = '12:00';
const LATEST = '23:55';
/** « À cinq minutes près » : le tour du serveur passe toutes les cinq minutes. */
const FIVE_MINUTES_IN_SECONDS = 300;
const DAY_BEFORE = 1;

/**
 * Pourquoi le mode automatique est impossible, ou `null` s'il ne l'est pas.
 *
 * Le plan s'arrête la VEILLE : sans heure limite, ou avec une heure limite le
 * jour même, aucune heure d'arrêt ne laisserait toutes les commandes dedans.
 */
export function autoImpossibleReason(
  cutoff: ProductionLatestOrderCutoffView | null,
): string | null {
  if (cutoff === null) {
    return 'Aucune heure limite de commande n’est réglée : sans elle, rien ne garantit qu’un arrêt automatique laisse toutes les commandes du lendemain dans le plan. Le mode automatique est impossible.';
  }
  if (cutoff.daysBefore === 0) {
    return `Les commandes restent ouvertes jusqu’au jour même, à ${cutoff.time} : un arrêt la veille laisserait des commandes hors du plan. Le mode automatique est impossible.`;
  }
  return null;
}

/** « la veille à 18:30 », « 2 jours avant à 12:00 ». */
export function cutoffLabel(cutoff: ProductionLatestOrderCutoffView): string {
  const when =
    cutoff.daysBefore === DAY_BEFORE ? 'la veille' : `${String(cutoff.daysBefore)} jours avant`;
  return `${when} à ${cutoff.time}`;
}

/**
 * **Production › Réglages** (plan `documentation/production/arret-du-plan.md`,
 * §2, Q5, Q6 ; lot A1) — comment le plan du lendemain s'arrête, et les jours
 * où le fournil ne produit pas.
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
    FoldTimeComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './production-settings-page.html',
  styleUrl: './production-settings-page.scss',
})
export class ProductionSettingsPage {
  private readonly api = inject(ProductionSettingsService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('production_settings:write'));

  protected readonly state = signal<LoadState>({ status: 'loading' });
  protected readonly mode = signal<ProductionCloseMode>('manual');
  protected readonly closeAt = signal('');
  protected readonly alertAt = signal('');
  protected readonly saving = signal(false);
  protected readonly closeRefusal = signal<string | null>(null);

  protected readonly newDay = signal('');
  protected readonly dayBusy = signal(false);
  protected readonly dayRefusal = signal<string | null>(null);

  protected readonly today = parisToday();
  protected readonly earliest = EARLIEST;
  protected readonly latest = LATEST;
  protected readonly step = FIVE_MINUTES_IN_SECONDS;
  protected readonly boundsHint = `Entre ${EARLIEST} et ${LATEST}.`;

  private readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  protected readonly autoImpossible = computed(() => {
    const view = this.view();
    return view === null ? null : autoImpossibleReason(view.latestOrderCutoff);
  });

  protected readonly cutoffSentence = computed(() => {
    const cutoff = this.view()?.latestOrderCutoff ?? null;
    return cutoff === null ? null : `Dernière heure limite de commande : ${cutoffLabel(cutoff)}.`;
  });

  protected readonly modeOptions = computed((): readonly FoldViewToggleOption[] => {
    const readOnly = !this.canWrite();
    // Un réglage déjà en automatique reste sélectionnable : on doit pouvoir le lire.
    const autoBlocked = this.autoImpossible() !== null && this.view()?.close.mode !== 'auto';
    return [
      { value: 'manual', label: 'Manuel', disabled: readOnly },
      { value: 'auto', label: 'Automatique', disabled: readOnly || autoBlocked },
    ];
  });

  protected readonly closedDays = computed(() =>
    (this.view()?.closedDays ?? []).map((date) => ({ date, label: dayLabelOf(date) })),
  );

  protected readonly canSave = computed(() => {
    const view = this.view();
    if (view === null || !this.canWrite() || this.saving()) {
      return false;
    }
    const hour = this.mode() === 'auto' ? this.closeAt() : this.alertAt();
    if (hour === '') {
      return false;
    }
    const close = view.close;
    return (
      this.mode() !== close.mode ||
      this.closeAt() !== (close.closeAt ?? '') ||
      this.alertAt() !== (close.alertAt ?? '')
    );
  });

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

  protected onMode(value: string): void {
    if (value === 'auto' || value === 'manual') {
      this.mode.set(value);
    }
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.closeRefusal.set(null);
    try {
      // Les deux heures voyagent toujours : celle de l'autre mode est gardée.
      await this.api.changeClose({
        mode: this.mode(),
        closeAt: this.closeAt() === '' ? null : this.closeAt(),
        alertAt: this.alertAt() === '' ? null : this.alertAt(),
      });
      this.notify.success('Arrêt du plan enregistré.');
      await this.load();
    } catch (error) {
      this.closeRefusal.set(httpErrorMessage(error, 'Le réglage n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
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
      this.mode.set(view.close.mode);
      this.closeAt.set(view.close.closeAt ?? '');
      this.alertAt.set(view.close.alertAt ?? '');
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
