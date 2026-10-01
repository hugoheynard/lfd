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

import { MyDeliveryRoundService } from '../my-delivery-round.service';

type PhotoState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly url: string };

/**
 * **La photo d'une étape, pour le livreur** — la même lecture que celle de la
 * feuille de route (`run-sheet-step-photo` : un blob par `HttpClient`, qui
 * porte le jeton, puis une URL locale rendue à la destruction), mais par la
 * route de « ma tournée », murée à SES arrêts : celle de la fiche client
 * (`admin/companies/…`) lui est fermée.
 */
@Component({
  selector: 'app-my-round-step-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldSpinnerComponent],
  templateUrl: './my-round-step-photo.html',
  styleUrl: './my-round-step-photo.scss',
})
export class MyRoundStepPhoto implements OnInit {
  private readonly service = inject(MyDeliveryRoundService);

  readonly roundId = input.required<string>();
  readonly stopId = input.required<string>();
  readonly stepId = input.required<string>();
  readonly stepTitle = input.required<string>();
  readonly revision = input.required<string>();

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
      const blob = await this.service.stepPhoto(
        this.roundId(),
        this.stopId(),
        this.stepId(),
        this.revision(),
      );
      this.state.set({ status: 'ready', url: URL.createObjectURL(blob) });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
