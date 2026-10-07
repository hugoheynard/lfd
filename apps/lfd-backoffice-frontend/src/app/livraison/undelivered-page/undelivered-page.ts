import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { UndeliveredStopView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { parisTimeOf } from '../delivery-loading';
import { DeliveryIncidentsService } from '../delivery-incidents.service';
import { roundLabel, serviceDayLabel } from '../delivery-rounds';
import { IncidentList } from '../incident-list/incident-list';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';

type UndeliveredState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly stops: readonly UndeliveredStopView[] };

/**
 * **« Non remis »** (`documentation/livraisons/livreur/a-la-porte.md`, AP-D7 ;
 * `parcours-du-livreur.md`, PL2) — les arrêts restés ouverts des tournées
 * rentrées, et ceux des tournées parties un jour passé sans jamais rentrer.
 *
 * Une VUE, et l'écran le dit : elle ne débloque rien. Faute des reports (6 c),
 * ces commandes restent dans leur tournée et se traitent hors application.
 */
@Component({
  selector: 'app-undelivered-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    IncidentList,
  ],
  templateUrl: './undelivered-page.html',
  styleUrl: './undelivered-page.scss',
})
export class UndeliveredPage {
  private readonly service = inject(DeliveryIncidentsService);

  protected readonly state = signal<UndeliveredState>({ status: 'loading' });
  protected readonly stops = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.stops : [];
  });

  protected readonly incidentPhoto: IncidentPhotoLoader = (incidentId) =>
    this.service.photo(incidentId);
  protected readonly timeOf = parisTimeOf;
  protected readonly dayLabel = serviceDayLabel;

  constructor() {
    void this.load();
  }

  /** « Kangoo · passage 1 · mardi 29 septembre » */
  protected roundOf(stop: UndeliveredStopView): string {
    return `${roundLabel(stop)} · ${serviceDayLabel(stop.serviceDay)}`;
  }

  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const { stops } = await this.service.undelivered();
      this.state.set({ status: 'ready', stops });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
