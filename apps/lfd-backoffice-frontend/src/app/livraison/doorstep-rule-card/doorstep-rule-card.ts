import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { DoorstepRule, DoorstepSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { DOORSTEP_RULE_OPTIONS } from '../doorstep-rules';
import { DoorstepSettingsService } from '../doorstep-settings.service';

type CardState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DoorstepSettingsView };

/**
 * **La décision réglée d'avance à la porte** (`a-la-porte.md`, B3 bis,
 * LB-Q6) — une carte de l'écran « Point de départ », le réglage GLOBAL.
 *
 * Quand le livreur signale « personne », « refus » ou « accès impossible »,
 * la règle s'applique aussitôt ; « Me demander » laisse décider le
 * commercial. Une adresse peut la redéfinir sur la fiche société. Elle se
 * fige au départ : une tournée partie garde la sienne. Enregistrée dès qu'on
 * la choisit ; sans `delivery_settings:write`, elle se lit seulement.
 */
@Component({
  selector: 'app-doorstep-rule-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './doorstep-rule-card.html',
  styleUrl: './doorstep-rule-card.scss',
})
export class DoorstepRuleCard {
  private readonly api = inject(DoorstepSettingsService);
  private readonly notify = inject(NotifyService);

  readonly canWrite = input(false);

  protected readonly state = signal<CardState>({ status: 'loading' });
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly options = DOORSTEP_RULE_OPTIONS;

  protected readonly rule = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view.rule : null;
  });

  protected readonly provenance = computed(() => {
    const state = this.state();
    return state.status === 'ready' && state.view.source === 'explicit'
      ? 'Réglé par l’équipe'
      : 'Par défaut — personne n’a encore réglé la décision à la porte';
  });

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected async choose(rule: DoorstepRule): Promise<void> {
    if (!this.canWrite() || this.saving() || rule === this.rule()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.api.save({ rule });
      this.notify.success('Décision à la porte enregistrée.');
      await this.load();
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, 'La décision à la porte n’a pas pu être enregistrée.'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      this.state.set({ status: 'ready', view: await this.api.settings() });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
