import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  DeliveryRoutingSettingsPayload,
  DeliverySimulationView,
  VehiclesView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFileDropzoneComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldTimeComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import {
  buildPayload,
  type DepartureChoice,
  EMPTY_SETTINGS,
  emptyStop,
  exampleScenario,
  importScenario,
  parseGps,
  SCENARIO_FILE_NAME,
  scenarioFileContent,
  type ScenarioDraft,
  type SettingsDraft,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
  settingsDraftOf,
  type StopDraft,
} from '../delivery-simulator';
import { SimulationResult } from '../simulation-result/simulation-result';

/** Ce que la flotte et les réglages ont pu donner au premier affichage. */
interface Prefill {
  readonly vehicles: readonly string[];
  readonly settings: SettingsDraft;
  readonly fleetUnread: boolean;
  readonly settingsUnread: boolean;
}

interface Simulated {
  readonly view: DeliverySimulationView;
  readonly settings: DeliveryRoutingSettingsPayload;
}

const DEPARTURE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'configured', label: 'Point de départ réglé' },
  { value: 'custom', label: 'Coordonnées saisies' },
];

/**
 * **Le simulateur de tournée** (`plan-preparation-de-tournee.md`, lot 9,
 * L9-C1 à L9-C6) : le calculateur du lot 7 sur des arrêts INVENTÉS — un
 * libellé, un point GPS collé, une fenêtre facultative.
 *
 * Rien n'est écrit : ni commande, ni tournée, ni réglage. Les véhicules sont
 * des noms (pré-remplis par la flotte active), les réglages partent de ceux
 * en vigueur et ne s'enregistrent jamais d'ici. Le scénario vit dans l'écran
 * et s'exporte en fichier JSON, qui se réimporte.
 *
 * La flotte et les réglages se lisent sous `delivery_settings:read`, que la
 * page (sous `delivery_rounds:read`) n'exige pas : sans eux, les champs
 * restent vides et l'écran le dit — aucune valeur n'est inventée.
 */
@Component({
  selector: 'app-simulator-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFileDropzoneComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    FoldTimeComponent,
    FoldViewToggleComponent,
    SimulationResult,
  ],
  templateUrl: './simulator-page.html',
  styleUrl: './simulator-page.scss',
})
export class SimulatorPage {
  private readonly routing = inject(DeliveryRoutingService);
  private readonly fleet = inject(DeliverySettingsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  protected readonly prefill = signal<Prefill | null>(null);
  protected readonly draft = signal<ScenarioDraft>(exampleScenario([], EMPTY_SETTINGS));
  protected readonly proposing = signal(false);
  protected readonly errors = signal<readonly string[]>([]);
  protected readonly refusal = signal<string | null>(null);
  protected readonly importRefusal = signal<string | null>(null);
  protected readonly result = signal<Simulated | null>(null);

  protected readonly departureOptions = DEPARTURE_OPTIONS;
  protected readonly maxStops = SIMULATION_MAX_STOPS;
  protected readonly maxVehicles = SIMULATION_MAX_VEHICLES;

  protected readonly canAddStop = computed(() => this.draft().stops.length < SIMULATION_MAX_STOPS);
  protected readonly canAddVehicle = computed(
    () => this.draft().vehicles.length < SIMULATION_MAX_VEHICLES,
  );
  protected readonly departureHint = computed(() =>
    this.gpsHint(this.draft().departureCoordinates),
  );

  constructor() {
    void this.load();
  }

  /** L'aide d'un champ de coordonnées : la faute tant qu'il y en a une. */
  protected gpsHint(text: string): string {
    const parsed = parseGps(text);
    return parsed.ok ? 'Latitude, longitude — comme les donne une carte.' : parsed.message;
  }

  protected updateStop(index: number, patch: Partial<StopDraft>): void {
    this.patch({
      stops: this.draft().stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)),
    });
  }

  protected addStop(): void {
    if (this.canAddStop()) {
      const stops = this.draft().stops;
      this.patch({ stops: [...stops, emptyStop(stops)] });
    }
  }

  protected removeStop(index: number): void {
    this.patch({ stops: this.draft().stops.filter((_, i) => i !== index) });
  }

  protected updateVehicle(index: number, name: string): void {
    this.patch({ vehicles: this.draft().vehicles.map((v, i) => (i === index ? name : v)) });
  }

  protected addVehicle(): void {
    if (this.canAddVehicle()) {
      this.patch({ vehicles: [...this.draft().vehicles, ''] });
    }
  }

  protected removeVehicle(index: number): void {
    this.patch({ vehicles: this.draft().vehicles.filter((_, i) => i !== index) });
  }

  protected updateSettings(patch: Partial<SettingsDraft>): void {
    this.patch({ settings: { ...this.draft().settings, ...patch } });
  }

  protected pickDeparture(value: string): void {
    const departure: DepartureChoice = value === 'custom' ? 'custom' : 'configured';
    this.patch({ departure });
  }

  protected setDepartureCoordinates(departureCoordinates: string): void {
    this.patch({ departureCoordinates });
  }

  /** Revenir au scénario d'exemple, pré-rempli comme au premier affichage. */
  protected reset(): void {
    const prefill = this.prefill();
    this.draft.set(exampleScenario(prefill?.vehicles ?? [], prefill?.settings ?? EMPTY_SETTINGS));
    this.clearMessages();
    this.result.set(null);
  }

  protected async propose(): Promise<void> {
    if (this.proposing()) {
      return;
    }
    this.clearMessages();
    const built = buildPayload(this.draft());
    if (!built.ok) {
      this.errors.set(built.errors);
      return;
    }
    this.proposing.set(true);
    try {
      const view = await this.routing.simulate(built.payload);
      this.result.set({ view, settings: built.payload.settings });
    } catch (error) {
      this.result.set(null);
      this.refusal.set(httpErrorMessage(error, 'La simulation n’a pas pu être calculée.'));
    } finally {
      this.proposing.set(false);
    }
  }

  protected exportScenario(): void {
    this.clearMessages();
    const built = buildPayload(this.draft());
    if (!built.ok) {
      this.errors.set(built.errors);
      return;
    }
    saveBlob(
      new Blob([scenarioFileContent(built.payload)], { type: 'application/json' }),
      SCENARIO_FILE_NAME,
    );
  }

  protected async importFiles(files: readonly File[]): Promise<void> {
    const file = files[0];
    if (file === undefined) {
      return;
    }
    this.clearMessages();
    const imported = importScenario(await file.text());
    if (!imported.ok) {
      this.importRefusal.set(imported.message);
      return;
    }
    this.draft.set(imported.draft);
    this.result.set(null);
    this.notify.success(`Scénario « ${file.name} » importé.`);
  }

  private patch(patch: Partial<ScenarioDraft>): void {
    this.draft.set({ ...this.draft(), ...patch });
  }

  private clearMessages(): void {
    this.errors.set([]);
    this.refusal.set(null);
    this.importRefusal.set(null);
  }

  private async load(): Promise<void> {
    const readable = this.permissions.can('delivery_settings:read');
    const [fleet, settings] = await Promise.allSettled([
      readable ? this.fleet.vehicles() : Promise.reject(new Error('sans droit')),
      readable ? this.routing.settings() : Promise.reject(new Error('sans droit')),
    ]);
    const prefill: Prefill = {
      vehicles: fleet.status === 'fulfilled' ? activeNames(fleet.value) : [],
      settings: settings.status === 'fulfilled' ? settingsDraftOf(settings.value) : EMPTY_SETTINGS,
      fleetUnread: fleet.status === 'rejected',
      settingsUnread: settings.status === 'rejected',
    };
    this.prefill.set(prefill);
    this.draft.set(exampleScenario(prefill.vehicles, prefill.settings));
  }
}

function activeNames(view: VehiclesView): readonly string[] {
  return view.vehicles
    .filter((vehicle) => vehicle.retiredAt === null)
    .map((vehicle) => vehicle.name)
    .slice(0, SIMULATION_MAX_VEHICLES);
}
