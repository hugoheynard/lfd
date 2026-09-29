import { HttpClient } from '@angular/common/http';
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

import { AdminDeliveryProcedureGateway } from '../../comptes-clients/admin-delivery-procedure.gateway';

type PhotoState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly url: string };

/**
 * **La photo d'une étape de procédure**, sur la feuille de route. Elle se lit
 * par la route staff de la procédure (`admin/companies/…/steps/:id/photo`,
 * sous `b2b_companies:read`) — la page ne la monte que si l'on a ce droit.
 *
 * `revision` part dans l'URL : la route répond `immutable`, et c'est la
 * révision de la photo (`photoRevision` de la feuille, la même valeur que la
 * vue de procédure staff) qui fait qu'une photo remplacée ne resserve jamais
 * l'ancienne, tout en laissant le cache servir d'une lecture à l'autre.
 */
@Component({
  selector: 'app-run-sheet-step-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldSpinnerComponent],
  templateUrl: './run-sheet-step-photo.html',
  styleUrl: './run-sheet-step-photo.scss',
})
export class RunSheetStepPhoto implements OnInit {
  private readonly http = inject(HttpClient);

  readonly companyId = input.required<string>();
  readonly addressId = input.required<string>();
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
      const gateway = new AdminDeliveryProcedureGateway(this.http, this.companyId());
      const blob = await gateway.photo(this.addressId(), this.stepId(), this.revision());
      this.state.set({ status: 'ready', url: URL.createObjectURL(blob) });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
