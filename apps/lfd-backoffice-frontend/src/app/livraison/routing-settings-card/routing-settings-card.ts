import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type {
  BinTypeView,
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
import { DeliveryBinsService } from '../delivery-bins.service';
import {
  defaultContainerOptions,
  MODE_OPTIONS,
  NO_DEFAULT_CONTAINER,
  sameSettings,
} from '../delivery-routing';
import { DeliveryRoutingService } from '../delivery-routing.service';

type SettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly view: DeliveryRoutingSettingsView;
      readonly binTypes: readonly BinTypeView[];
    };

/**
 * **Les réglages du calcul de tournée** (`plan-preparation-de-tournee.md`,
 * lot 7, L7-C13 et L7-C15) — une carte de l'écran « Point de départ ».
 *
 * Le détour et la vitesse moyenne ne se règlent plus : le vol d'oiseau a
 * disparu (lot 10 bis, L10b-C5). Le contrat les accepte encore, dépréciés ;
 * la carte renvoie les valeurs lues, inchangées. Tant que personne n'a réglé,
 * ce sont les valeurs d'usine, et la carte le dit. Le contenant par défaut
 * d'une commande (2026-10-06) se choisit parmi les types de bac en service ;
 * « Aucun » le vide. Sans
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
  private readonly bins = inject(DeliveryBinsService);
  private readonly notify = inject(NotifyService);

  readonly canWrite = input(false);

  protected readonly state = signal<SettingsState>({ status: 'loading' });
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly earliest = signal('');
  protected readonly maxRound = signal<number | null>(null);
  protected readonly stop = signal<number | null>(null);
  protected readonly safetyMargin = signal<number | null>(null);
  protected readonly binGap = signal<number | null>(null);
  protected readonly mode = signal<DeliveryProposalMode | null>(null);
  protected readonly multiplePassages = signal(false);
  /** Le type choisi, ou `NO_DEFAULT_CONTAINER` : pas de contenant par défaut. */
  protected readonly defaultBinType = signal<string>(NO_DEFAULT_CONTAINER);
  protected readonly defaultBinCount = signal<number | null>(1);

  protected readonly hasDefaultContainer = computed(
    () => this.defaultBinType() !== NO_DEFAULT_CONTAINER,
  );

  protected readonly binTypeOptions = computed(() => {
    const state = this.state();
    return state.status === 'ready'
      ? defaultContainerOptions(state.binTypes, state.view.defaultContainer)
      : [];
  });

  protected readonly modeOptions = MODE_OPTIONS;

  /** L7t-C1 : l'aide reprend la valeur saisie, pour que N se lise en minutes. */
  protected readonly safetyMarginHint = computed(() => {
    const margin = this.safetyMargin();
    return `Le calcul préfère arriver au moins ${margin === null ? 'N' : String(margin)} minutes avant la fin du créneau du client.`;
  });

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
    const safetyMargin = this.safetyMargin();
    const binGap = this.binGap();
    const mode = this.mode();
    const earliest = this.earliest();
    const binType = this.defaultBinType();
    const count = this.defaultBinCount();
    if (
      (binType !== NO_DEFAULT_CONTAINER && count === null) ||
      state.status !== 'ready' ||
      maxRound === null ||
      stop === null ||
      safetyMargin === null ||
      binGap === null ||
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
      safetyMarginMinutes: safetyMargin,
      binGapCm: binGap,
      defaultMode: mode,
      multiplePassages: this.multiplePassages(),
      defaultContainer:
        binType === NO_DEFAULT_CONTAINER || count === null ? null : { binTypeId: binType, count },
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
      const [view, { types }] = await Promise.all([this.api.settings(), this.bins.binTypes()]);
      this.state.set({ status: 'ready', view, binTypes: types });
      this.earliest.set(view.earliestDeparture);
      this.maxRound.set(view.maxRoundMinutes);
      this.stop.set(view.stopMinutes);
      this.safetyMargin.set(view.safetyMarginMinutes);
      this.binGap.set(view.binGapCm);
      this.mode.set(view.defaultMode);
      this.multiplePassages.set(view.multiplePassages);
      this.defaultBinType.set(view.defaultContainer?.binTypeId ?? NO_DEFAULT_CONTAINER);
      this.defaultBinCount.set(view.defaultContainer?.count ?? 1);
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
