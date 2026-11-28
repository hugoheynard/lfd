import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { ResupplySwitchStore } from '../../shared/resupply-switch/resupply-switch.store';

const MODIFIED_AT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * **Le réassort des boutiques** — l'interrupteur global (plan
 * `reassort-boutiques/plan-interrupteur-du-reassort.md`, décidé par Hugo le
 * 2026-11-28). Éteint par défaut.
 *
 * S'enregistre d'un geste, comme le rangement des fiches : la case cochée
 * part aussitôt, et un refus la remet à l'état servi.
 */
@Component({
  selector: 'app-resupply-switch-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './resupply-switch-card.html',
})
export class ResupplySwitchCard {
  private readonly store = inject(ResupplySwitchStore);

  readonly canWrite = input.required<boolean>();

  protected readonly loadFailed = this.store.loadFailed;

  /** Par l'identité : un refus remet une valeur neuve, et la case revient à l'état servi. */
  protected readonly shown = linkedSignal<readonly { readonly enabled: boolean }[]>(() => [
    { enabled: this.store.enabled() },
  ]);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** « Modifié par X, le … », ou le défaut d'un interrupteur jamais posé. */
  protected readonly lastChange = computed(() => {
    const view = this.store.view();
    if (view === null || view.updatedAt === null) {
      return 'Jamais posé : éteint par défaut.';
    }
    const when = MODIFIED_AT.format(new Date(view.updatedAt));
    return view.updatedBy === null
      ? `Modifié le ${when}.`
      : `Modifié par ${view.updatedBy}, le ${when}.`;
  });

  constructor() {
    void this.store.ensureLoaded();
  }

  protected retry(): void {
    void this.store.ensureLoaded();
  }

  protected async set(enabled: boolean): Promise<void> {
    if (!this.canWrite() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.store.set(enabled);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le réassort n’a pas pu être allumé ou éteint.'));
      this.shown.set([{ enabled: this.store.enabled() }]);
    } finally {
      this.busy.set(false);
    }
  }
}
