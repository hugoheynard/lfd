import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { MediaSeriesPayload, MediaSeriesView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldInputComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { SERIES_LIMITS } from '../media-series';

/** L'issue d'un enregistrement : l'identifiant, ou la phrase du refus. */
export type SeriesSaveOutcome = { readonly id: string } | { readonly refusal: string };

/** Ouvrir (`series: null`) ou corriger une série. */
export interface SeriesPanelData {
  readonly series: MediaSeriesView | null;
  /** Aujourd'hui à Paris, `AAAA-MM-JJ` — la borne de la prise de vue. */
  readonly today: string;
  /**
   * Écrit au serveur. Le panneau reste ouvert sur un refus, saisie intacte :
   * un titre refusé se corrige, il ne se retape pas.
   */
  readonly save: (payload: MediaSeriesPayload) => Promise<SeriesSaveOutcome>;
}

/** La série écrite. `undefined` au `closed` = annulé. */
export interface SeriesPanelResult {
  readonly id: string;
}

/**
 * **Une série** — son titre, son jour de prise de vue, sa note d'intention.
 *
 * Le même panneau ouvre et corrige : deux formulaires pour les trois mêmes
 * champs finiraient par ne plus borner la même chose.
 *
 * 🔴 Les bornes sont celles du domaine du serveur (`MediaSeries`) : l'écran
 * grise ce qu'il refuserait, il ne décide pas. Un refus du serveur s'affiche
 * tel quel, dans le panneau.
 */
@Component({
  selector: 'app-series-panel',
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './series-panel.html',
  styleUrl: './series-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<SeriesPanelResult>>(FoldPanelRef);

  readonly data = input.required<SeriesPanelData>();

  protected readonly limits = SERIES_LIMITS;
  protected readonly title = signal('');
  protected readonly shotOn = signal('');
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  /** Le refus du serveur, tel qu'il l'a dit. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly titleLength = computed(() => this.title().trim().length);
  protected readonly noteLength = computed(() => this.note().trim().length);

  /**
   * Ce que le serveur refuserait, dit avant. Le titre VIDE n'y est pas : c'est
   * l'état d'ouverture, et le crier avant la première lettre serait un reproche.
   * Il bloque seulement l'enregistrement.
   */
  protected readonly problem = computed(() => {
    if (this.titleLength() > SERIES_LIMITS.title) {
      return `Le titre dépasse ${String(SERIES_LIMITS.title)} caractères.`;
    }
    if (this.noteLength() > SERIES_LIMITS.note) {
      return `La note dépasse ${String(SERIES_LIMITS.note)} caractères.`;
    }
    const day = this.shotOn();
    if (day !== '' && day > this.data().today) {
      return 'La prise de vue ne peut pas être à venir.';
    }
    return null;
  });

  protected readonly blocked = computed(
    () => this.titleLength() === 0 || this.problem() !== null || this.saving(),
  );

  protected readonly editing = computed(() => this.data().series !== null);

  constructor() {
    effect(() => {
      const series = this.data().series;
      this.title.set(series?.title ?? '');
      this.shotOn.set(series?.shotOn ?? '');
      this.note.set(series?.note ?? '');
    });
  }

  /** Une saisie touchée efface le refus précédent : il parlait d'autre chose. */
  protected edit(field: 'title' | 'shotOn' | 'note', value: string): void {
    this[field].set(value);
    this.refusal.set(null);
  }

  protected async submit(): Promise<void> {
    if (this.blocked()) {
      return;
    }
    this.saving.set(true);
    const outcome = await this.data().save(this.payload());
    this.saving.set(false);
    if ('refusal' in outcome) {
      this.refusal.set(outcome.refusal);
      return;
    }
    this.ref.close({ id: outcome.id });
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Un champ facultatif vide part à `null` : « pas de note », pas une note vide. */
  private payload(): MediaSeriesPayload {
    const note = this.note().trim();
    return {
      title: this.title().trim(),
      shotOn: this.shotOn() === '' ? null : this.shotOn(),
      note: note === '' ? null : note,
    };
  }
}
