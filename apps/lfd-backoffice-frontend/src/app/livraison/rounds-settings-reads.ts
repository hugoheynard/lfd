import { computed, inject, Injectable, signal } from '@angular/core';
import type { DeliveryDriverView, VehicleView } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';

import type { MapDeparture } from './delivery-map/delivery-map';
import { DeliveryRoundsService } from './delivery-rounds.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { loadBadgesOf } from './round-vehicle-choices';

type FleetState = readonly VehicleView[] | 'error' | null;

/**
 * **Ce que l'organisateur lit à côté de la composition** : la flotte, les
 * livreurs affectables, le départ des tournées. Sorti de `RoundsPage` ; la
 * page décide QUAND lire, selon les droits de qui regarde. Un échec ne bloque
 * pas le tableau : il se dit à part. Fourni par la page.
 */
@Injectable()
export class RoundsSettingsReads {
  private readonly rounds = inject(DeliveryRoundsService);
  private readonly settings = inject(DeliverySettingsService);

  readonly fleet = signal<FleetState>(null);
  readonly fleetUnreadable = computed(() => this.fleet() === 'error');

  /** Les livreurs affectables (MT-D2 v2) — lus seulement pour qui compose. */
  private readonly drivers = signal<readonly DeliveryDriverView[] | 'error' | null>(null);
  readonly driversUnreadable = computed(() => this.drivers() === 'error');
  readonly driverOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const drivers = this.drivers();
    return Array.isArray(drivers)
      ? drivers.map((driver) => ({ value: driver.staffUserId, label: driver.name }))
      : [];
  });

  /** Le départ des tournées, lu dans les réglages ; `null` : pas de carte. */
  readonly departurePoint = signal<MapDeparture | null>(null);

  /** Le chargement de chaque véhicule connu — lecture seule (L2b-C3, L2b-C4). */
  readonly loadBadges = computed(() => {
    const fleet = this.fleet();
    return loadBadgesOf(Array.isArray(fleet) ? fleet : []);
  });

  async loadDeparture(): Promise<void> {
    try {
      const { point } = await this.settings.departure();
      const gps = point?.gps ?? null;
      this.departurePoint.set(point === null || gps === null ? null : { label: point.label, gps });
    } catch {
      this.departurePoint.set(null);
    }
  }

  async loadDrivers(): Promise<void> {
    try {
      this.drivers.set((await this.rounds.drivers()).drivers);
    } catch {
      this.drivers.set('error');
    }
  }

  async loadFleet(): Promise<void> {
    try {
      this.fleet.set((await this.settings.vehicles()).vehicles);
    } catch {
      this.fleet.set('error');
    }
  }
}
