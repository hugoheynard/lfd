import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { FoldCalloutComponent, FoldSpinnerComponent } from 'fold-ng';

import { QualityService } from '../quality.service';

type PhotoState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly url: string };

/**
 * **Une photo d'un contrôle rendu.** Ses octets se lisent par une route
 * authentifiée en `write` (D3), jamais par une URL publique : on les demande
 * en blob, et l'URL locale est rendue à la destruction.
 *
 * Un clic l'ouvre en grand dans un nouvel onglet — la vignette ne suffit pas à
 * lire une étiquette.
 */
@Component({
  selector: 'app-quality-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldSpinnerComponent],
  templateUrl: './quality-photo.html',
  styleUrl: './quality-photo.scss',
})
export class QualityPhoto implements OnInit {
  private readonly service = inject(QualityService);

  readonly checkId = input.required<string>();
  readonly position = input.required<number>();

  protected readonly state = signal<PhotoState>({ status: 'loading' });
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

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const blob = await this.service.photo(this.checkId(), this.position());
      this.state.set({ status: 'ready', url: URL.createObjectURL(blob) });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
