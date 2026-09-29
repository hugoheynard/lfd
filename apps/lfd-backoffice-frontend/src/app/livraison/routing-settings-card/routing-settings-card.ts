import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type {
  DeliveryProposalMode,
  DeliveryRoutingSettingsPayload,
  DeliveryRoutingSettingsView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldTimeComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { MODE_OPTIONS, sameSettings } from '../delivery-routing';
import { DeliveryRoutingService } from '../delivery-routing.service';

type SettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryRoutingSettingsView };

/**
 * **Les réglages du calcul de tournée** (`plan-preparation-de-tournee.md`,
 * lot 7, L7-C13 et L7-C15) — une carte de l'écran « Point de départ ».
 *
 * Le détour et la vitesse moyenne ne se règlent plus : le vol d'oiseau a
 * disparu (lot 10 bis, L10b-C5). Le contrat les accepte encore, dépréciés ;
 * la carte renvoie les valeurs lues, inchangées. Tant que personne n'a réglé,
 * ce sont les valeurs d'usine, et la carte le dit. Sans
 * `delivery_settings:write`, tout est en lecture seule.
 */
@Component({
  selector: 'app-routing-settings-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldTimeComponent,
  ],
  templateUrl: './routing-settings-card.html',
  styleUrl: './routing-settings-card.scss',
})
export class RoutingSettingsCard {
  private readonly api = inject(DeliveryRoutingService);
  private readonly notify = inject(NotifyService);

  readonly canWrite = input(false);

  protected readonly state = signal<SettingsState>({ status: 'loading' });
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly earliest = signal('');
  protected readonly maxRound = signal<number | null>(null);
  protected readonly stop = signal<number | null>(null);
  protected readonly mode = signal<DeliveryProposalMode | null>(null);
  protected readonly multiplePassages = signal(false);

  protected readonly modeOptions = MODE_OPTIONS;

  protected readonly provenance = computed(() => {
    const state = this.state();
    return state.status === 'ready' && state.view.source === 'explicit'
      ? 'Réglé par l’équipe'
      : 'Par défaut — personne n’a encore réglé le calcul';
  });

  /** Le brouillon complet, ou `null` tant qu'un champ manque. */
  private readonly draft = computed((): DeliveryRoutingSettingsPayload | null => {
    const state = this.state();
    const maxRound = this.maxRound();
    const stop = this.stop();
    const mode = this.mode();
    const earliest = this.earliest();
    if (
      state.status !== 'ready' ||
      maxRound === null ||
      stop === null ||
      mode === null ||
      earliest === ''
    ) {
      return null;
    }
    return {
      // Dépréciés (L10b-C5) : renvoyés tels qu'on les a lus, jamais réglés ici.
      detourPercent: state.view.detourPercent,
      averageSpeedKmh: state.view.averageSpeedKmh,
      earliestDeparture: earliest,
      maxRoundMinutes: maxRound,
      stopMinutes: stop,
      defaultMode: mode,
      multiplePassages: this.multiplePassages(),
    };
  });

  /** Enregistrer n'est cliquable que si le brouillon est complet ET différent. */
  protected readonly canSave = computed(() => {
    const state = this.state();
    const draft = this.draft();
    return (
      this.canWrite() &&
      !this.saving() &&
      state.status === 'ready' &&
      draft !== null &&
      !sameSettings(draft, state.view)
    );
  });

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (draft === null || !this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.api.saveSettings(draft);
      this.notify.success('Réglages du calcul enregistrés.');
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Les réglages n’ont pas pu être enregistrés.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      const view = await this.api.settings();
      this.state.set({ status: 'ready', view });
      this.earliest.set(view.earliestDeparture);
      this.maxRound.set(view.maxRoundMinutes);
      this.stop.set(view.stopMinutes);
      this.mode.set(view.defaultMode);
      this.multiplePassages.set(view.multiplePassages);
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
