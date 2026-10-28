import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  MAX_FIXED_TRANCHES,
  type ProductionTrancheMode,
  type ProductionTranchesView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldTimeComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { ProductionSettingsService } from '../production-settings.service';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/u;

const MODE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'fixed', label: 'Fixes' },
  { value: 'computed', label: 'Calculées' },
];

function isMode(value: string): value is ProductionTrancheMode {
  return value === 'fixed' || value === 'computed';
}

/** Les heures triées, sans doublon — l'ordre d'affichage comme celui de l'envoi. */
export function sortedTranches(times: readonly string[]): string[] {
  return [...new Set(times)].sort();
}

/**
 * **Les tranches de production** (plan
 * `documentation/production/plan-tranches-de-production.md`, §4, lot T1) —
 * fixes, réglées ici, ou calculées sur les échéances moins les marges du
 * commerce.
 *
 * Un brouillon local, relu de la vue à chaque rechargement du parent : rien
 * ne part avant « Enregistrer », qui n'est cliquable que si le brouillon
 * diffère de ce qui est servi. La forme (HH:mm, doublon, borne de 8) est
 * tenue ici ; la règle est celle du domaine, dont le refus s'affiche tel quel.
 */
@Component({
  selector: 'app-production-tranches-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldTimeComponent,
    FoldViewToggleComponent,
    RouterLink,
  ],
  templateUrl: './production-tranches-card.html',
  styleUrl: './production-tranches-card.scss',
})
export class ProductionTranchesCard {
  private readonly api = inject(ProductionSettingsService);

  readonly tranches = input.required<ProductionTranchesView>();
  readonly canWrite = input.required<boolean>();
  /** Après un enregistrement accepté : le parent relit. */
  readonly saved = output();

  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly max = MAX_FIXED_TRANCHES;

  protected readonly mode = linkedSignal<ProductionTrancheMode>(() => this.tranches().mode);
  protected readonly times = linkedSignal<readonly string[]>(() =>
    sortedTranches(this.tranches().fixedTranches),
  );
  protected readonly newTime = signal('');
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly canAddTime = computed(
    () =>
      this.canWrite() &&
      HH_MM.test(this.newTime()) &&
      !this.times().includes(this.newTime()) &&
      this.times().length < MAX_FIXED_TRANCHES,
  );

  protected readonly dirty = computed(() => {
    const served = this.tranches();
    return (
      this.mode() !== served.mode ||
      this.times().join(',') !== sortedTranches(served.fixedTranches).join(',')
    );
  });

  protected setMode(value: string): void {
    if (isMode(value)) {
      this.mode.set(value);
    }
  }

  protected addTime(): void {
    if (!this.canAddTime()) {
      return;
    }
    this.times.set(sortedTranches([...this.times(), this.newTime()]));
    this.newTime.set('');
  }

  protected removeTime(time: string): void {
    this.times.set(this.times().filter((t) => t !== time));
  }

  protected async save(): Promise<void> {
    if (!this.canWrite() || !this.dirty() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.api.saveTranches({ mode: this.mode(), fixedTranches: [...this.times()] });
      this.saved.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Les tranches n’ont pas pu être enregistrées.'));
    } finally {
      this.busy.set(false);
    }
  }
}
