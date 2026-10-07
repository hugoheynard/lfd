import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeliveryZoneView, VehicleView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryZonesService } from '../../b2b/reglages/delivery-zones.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { activeCountLabel, retiredOnLabel, splitFleet } from '../fleet';
import { energyLabel, vehicleLoadLine, wheelArchesLabel } from '../vehicle-load';
import { VehicleDialog, type VehicleDialogData } from '../vehicle-dialog/vehicle-dialog';
import { zonesLine } from '../vehicle-zones';

type FleetState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly vehicles: readonly VehicleView[] };

/**
 * **La flotte** — avec quoi on tient l'offre de livraison
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 2a).
 *
 * Aucun nombre de véhicules saisi : le nombre EST la liste des actifs. Un
 * véhicule ne se supprime pas, il se **retire** — daté, parce que la
 * composition lira « actif ce jour-là » — et se réactive.
 *
 * Les gestes n'apparaissent qu'avec `delivery_settings:write` ; le serveur
 * refuse de toute façon. Ses refus s'affichent tels quels : la plaque en double
 * nomme le véhicule actif qui la porte déjà.
 */
@Component({
  selector: 'app-vehicles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './vehicles-page.html',
  styleUrl: './vehicles-page.scss',
})
export class VehiclesPage {
  private readonly api = inject(DeliverySettingsService);
  private readonly zonesApi = inject(DeliveryZonesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<FleetState>({ status: 'loading' });
  /** Le refus d'un retrait ou d'une réactivation — la liste reste à l'écran. */
  protected readonly refusal = signal<string | null>(null);
  /** Le véhicule dont un geste est en vol : ses boutons attendent. */
  protected readonly busyId = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_settings:write'));

  protected readonly fleet = computed(() => {
    const state = this.state();
    return splitFleet(state.status === 'ready' ? state.vehicles : []);
  });

  protected readonly activeCount = computed(() => activeCountLabel(this.fleet().active.length));

  protected readonly retiredOn = retiredOnLabel;
  protected readonly loadLine = vehicleLoadLine;
  protected readonly archesLine = wheelArchesLabel;
  protected readonly energyLine = energyLabel;

  /** Les zones du commerce, pour nommer celles d'un véhicule ; `null` tant qu'on ne les a pas lues. */
  private readonly zones = signal<readonly DeliveryZoneView[] | null>(null);

  /** « Zones : Aix », ou `null` : il va partout (2026-10-06). */
  protected zonesOf(vehicle: VehicleView): string | null {
    return zonesLine(vehicle.allowedZoneIds, this.zones());
  }

  constructor() {
    void this.load();
    void this.loadZones();
  }

  /**
   * Une ligne secondaire : son échec laisse la flotte à l'écran, et les zones
   * d'un véhicule restreint sont comptées sans être nommées (`zonesLine`).
   */
  private async loadZones(): Promise<void> {
    try {
      this.zones.set(await this.zonesApi.list());
    } catch {
      this.zones.set(null);
    }
  }

  protected retry(): void {
    void this.load();
  }

  protected add(): void {
    void this.edit({});
  }

  protected correct(vehicle: VehicleView): void {
    void this.edit({ vehicle });
  }

  protected retire(vehicle: VehicleView): Promise<void> {
    return this.act(
      vehicle,
      () => this.api.retireVehicle(vehicle.id),
      `« ${vehicle.name} » retiré de la flotte.`,
      "Le véhicule n'a pas pu être retiré.",
    );
  }

  protected reactivate(vehicle: VehicleView): Promise<void> {
    return this.act(
      vehicle,
      () => this.api.reactivateVehicle(vehicle.id),
      `« ${vehicle.name} » remis en service.`,
      "Le véhicule n'a pas pu être réactivé.",
    );
  }

  private async edit(data: VehicleDialogData): Promise<void> {
    this.refusal.set(null);
    const ref = this.panels.open<VehicleDialogData, boolean>(VehicleDialog, { data });
    if ((await ref.closed) !== true) {
      return;
    }
    this.notify.success(data.vehicle === undefined ? 'Véhicule ajouté.' : 'Véhicule mis à jour.');
    await this.load();
  }

  private async act(
    vehicle: VehicleView,
    write: () => Promise<void>,
    said: string,
    fallback: string,
  ): Promise<void> {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(vehicle.id);
    this.refusal.set(null);
    try {
      await write();
      this.notify.success(said);
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      this.busyId.set(null);
    }
  }

  private async load(): Promise<void> {
    // Une relecture après un geste garde la liste à l'écran : seul le premier
    // chargement montre l'attente.
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      const view = await this.api.vehicles();
      this.state.set({ status: 'ready', vehicles: view.vehicles });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
