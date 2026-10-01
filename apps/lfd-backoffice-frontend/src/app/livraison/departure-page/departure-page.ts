import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DepartureView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { pointAddressLine } from '../fleet';
import { DoorstepRuleCard } from '../doorstep-rule-card/doorstep-rule-card';
import { RoutingSettingsCard } from '../routing-settings-card/routing-settings-card';

type DepartureState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DepartureView };

/** Là où se règle le point GPS d'un point de retrait. */
const PICKUP_POINTS = '/b2b/reglages/points-de-retrait';

/**
 * **D'où partent les tournées** (`plan-preparation-de-tournee.md`, lot 2b, Q9).
 *
 * Un point de retrait RÉFÉRENCÉ, jamais recopié : l'adresse du labo n'a qu'une
 * source, et elle se corrige sur l'écran des points de retrait. Tant que
 * personne n'a choisi, c'est le point par défaut, et l'écran le dit. Un point
 * sans GPS est signalé : aucune distance ne partira de là.
 *
 * Le choix n'apparaît qu'avec `delivery_settings:write`. Les réglages du
 * calcul de tournée (lot 7, L7-C13) vivent sous le point : c'est d'ici que
 * partent les distances. La décision réglée d'avance à la porte (B3 bis)
 * les suit : c'est le dernier réglage de la livraison.
 */
@Component({
  selector: 'app-departure-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RoutingSettingsCard,
    DoorstepRuleCard,
  ],
  templateUrl: './departure-page.html',
  styleUrl: './departure-page.scss',
})
export class DeparturePage {
  private readonly api = inject(DeliverySettingsService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<DepartureState>({ status: 'loading' });
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_settings:write'));

  private readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  protected readonly point = computed(() => this.view()?.point ?? null);

  protected readonly provenance = computed(() =>
    this.view()?.source === 'explicit'
      ? 'Choisi dans les réglages'
      : 'Par défaut — le point de retrait par défaut, tant que personne n’a choisi',
  );

  protected readonly options = computed((): FoldSelectOption<string>[] =>
    (this.view()?.choices ?? []).map((choice) => ({
      value: choice.pickupAddressId,
      label: choice.label.trim() === '' ? choice.address.ville : choice.label,
    })),
  );

  protected readonly addressLine = computed(() => {
    const point = this.point();
    return point === null ? '' : pointAddressLine(point);
  });

  protected readonly gpsLine = computed(() => {
    const gps = this.point()?.gps ?? null;
    return gps === null ? '' : `${String(gps.lat)}, ${String(gps.lng)}`;
  });

  /** Le détail du point, où l'on pose son GPS. */
  protected readonly pointLink = computed(() => {
    const point = this.point();
    return point === null
      ? PICKUP_POINTS
      : `${PICKUP_POINTS}/${encodeURIComponent(point.pickupAddressId)}`;
  });

  /** Seul qui peut ouvrir l'écran des points de retrait reçoit le lien. */
  protected readonly canOpenPickupPoints = computed(() =>
    this.permissions.can('b2b_settings:read'),
  );

  protected readonly pickupPointsLink = PICKUP_POINTS;

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected async choose(pickupAddressId: string): Promise<void> {
    if (this.saving() || pickupAddressId === this.point()?.pickupAddressId) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.api.setDeparture({ pickupAddressId });
      this.notify.success('Point de départ enregistré.');
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le point de départ n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      this.state.set({ status: 'ready', view: await this.api.departure() });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
