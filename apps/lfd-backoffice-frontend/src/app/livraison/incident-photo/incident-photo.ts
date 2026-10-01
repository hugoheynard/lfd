import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldSpinnerComponent } from 'fold-ng';

/** Qui sert la photo d'un signalement : la route murée du livreur, ou celle de l'admin. */
export type IncidentPhotoLoader = (incidentId: string) => Promise<Blob>;

type PhotoState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly url: string };

/**
 * **La photo d'un signalement** — lue À LA DEMANDE : un téléphone en tournée
 * ne télécharge pas toutes les photos de la journée pour en regarder une. La
 * même lecture que la photo de procédure (un blob par `HttpClient`, qui porte
 * le jeton, puis une URL locale rendue à la destruction) ; la route dépend de
 * qui regarde, d'où le chargeur en entrée.
 */
@Component({
  selector: 'app-incident-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldSpinnerComponent],
  templateUrl: './incident-photo.html',
  styleUrl: './incident-photo.scss',
})
export class IncidentPhoto {
  readonly incidentId = input.required<string>();
  readonly load = input.required<IncidentPhotoLoader>();

  protected readonly state = signal<PhotoState>({ status: 'idle' });
  protected readonly url = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.url : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      const state = this.state();
      if (state.status === 'ready') {
        URL.revokeObjectURL(state.url);
      }
    });
  }

  protected async open(): Promise<void> {
    if (this.state().status === 'loading' || this.state().status === 'ready') {
      return;
    }
    this.state.set({ status: 'loading' });
    try {
      const blob = await this.load()(this.incidentId());
      this.state.set({ status: 'ready', url: URL.createObjectURL(blob) });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
