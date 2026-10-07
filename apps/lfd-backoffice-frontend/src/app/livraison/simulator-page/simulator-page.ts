import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeliverySimulationFromDayView, VehicleView, VehiclesView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
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
import { canReadDeliverySettings } from '../delivery-settings-access';
import { DayImport } from '../day-import/day-import';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import {
  buildPayload,
  type DepartureChoice,
  EMPTY_SETTINGS,
  emptyStop,
  exampleScenario,
  parseGps,
  type SettingsDraft,
  SIMULATION_MAX_STOP_MINUTES,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
  SIMULATION_MIN_STOP_MINUTES,
  settingsDraftOf,
  type StopDraft,
} from '../delivery-simulator';
import { SimulationResult } from '../simulation-result/simulation-result';
import { vehicleBadgeLabel } from '../vehicle-load';
import { SimulationScenarios } from '../simulation-scenarios/simulation-scenarios';
import { SimulatorScenarioSession } from '../simulator-scenario-session';

/** Ce que la flotte et les réglages ont pu donner au premier affichage. */
interface Prefill {
  readonly vehicles: readonly string[];
  readonly settings: SettingsDraft;
  readonly fleetUnread: boolean;
  readonly settingsUnread: boolean;
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
 * en vigueur et ne s'enregistrent jamais d'ici. Le scénario s'enregistre
 * (L9-C7, sous `delivery_rounds:write` — les boutons disparaissent sans), part
 * d'une vraie journée copiée (L9-C8), et s'exporte toujours en fichier JSON.
 *
 * La flotte et les réglages se lisent sous `delivery_settings:read` OU
 * `delivery_rounds:read` (Q10 « A ») — donc sous le droit même de la page.
 * Si leur lecture échoue, les champs restent vides et l'écran le dit — aucune
 * valeur n'est inventée.
 */
@Component({
  selector: 'app-simulator-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DayImport,
    FoldBadgeComponent,
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
    SimulationScenarios,
  ],
  templateUrl: './simulator-page.html',
  styleUrl: './simulator-page.scss',
})
export class SimulatorPage {
  private readonly routing = inject(DeliveryRoutingService);
  private readonly fleet = inject(DeliverySettingsService);
  private readonly permissions = inject(PermissionsStore);

  /** Le scénario et son enregistrement ; ses signaux gardent leurs noms au gabarit. */
  private readonly session = new SimulatorScenarioSession();

  protected readonly prefill = signal<Prefill | null>(null);
  /** La flotte active lue au chargement : de quoi badger un nom qui en vient. */
  private readonly fleetVehicles = signal<readonly VehicleView[]>([]);
  protected readonly draft = this.session.draft;
  protected readonly proposing = signal(false);
  protected readonly errors = this.session.errors;
  protected readonly refusal = this.session.refusal;
  protected readonly importRefusal = this.session.importRefusal;
  protected readonly result = this.session.result;

  protected readonly canWrite = computed(() => this.permissions.can('delivery_rounds:write'));
  protected readonly current = this.session.current;
  protected readonly modified = this.session.modified;
  protected readonly revision = this.session.revision;
  protected readonly saveAsOpen = this.session.saveAsOpen;
  protected readonly saveName = this.session.saveName;
  protected readonly saving = this.session.saving;
  protected readonly saveRefusal = this.session.saveRefusal;
  protected readonly minStopMinutes = SIMULATION_MIN_STOP_MINUTES;
  protected readonly maxStopMinutes = SIMULATION_MAX_STOP_MINUTES;

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
    this.session.patch({
      stops: this.draft().stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)),
    });
  }

  protected addStop(): void {
    if (this.canAddStop()) {
      const stops = this.draft().stops;
      this.session.patch({ stops: [...stops, emptyStop(stops)] });
    }
  }

  protected removeStop(index: number): void {
    this.session.patch({ stops: this.draft().stops.filter((_, i) => i !== index) });
  }

  protected updateVehicle(index: number, name: string): void {
    this.session.patch({ vehicles: this.draft().vehicles.map((v, i) => (i === index ? name : v)) });
  }

  protected addVehicle(): void {
    if (this.canAddVehicle()) {
      this.session.patch({ vehicles: [...this.draft().vehicles, ''] });
    }
  }

  protected removeVehicle(index: number): void {
    this.session.patch({ vehicles: this.draft().vehicles.filter((_, i) => i !== index) });
  }

  protected updateSettings(patch: Partial<SettingsDraft>): void {
    this.session.patch({ settings: { ...this.draft().settings, ...patch } });
  }

  protected pickDeparture(value: string): void {
    const departure: DepartureChoice = value === 'custom' ? 'custom' : 'configured';
    this.session.patch({ departure });
  }

  protected setDepartureCoordinates(departureCoordinates: string): void {
    this.session.patch({ departureCoordinates });
  }

  /** Revenir au scénario d'exemple, pré-rempli comme au premier affichage. */
  protected reset(): void {
    const prefill = this.prefill();
    this.session.replaceDraft(
      exampleScenario(prefill?.vehicles ?? [], prefill?.settings ?? EMPTY_SETTINGS),
      null,
    );
    this.session.clearMessages();
  }

  protected readonly save = (): Promise<void> => this.session.save();
  protected readonly openSaveAs = (): void => this.session.openSaveAs();
  protected readonly saveAs = (): Promise<void> => this.session.saveAs();
  protected readonly openScenario = (id: string): Promise<void> => this.session.openScenario(id);
  protected readonly forget = (id: string): void => this.session.forget(id);
  protected readonly startFromDay = (view: DeliverySimulationFromDayView): void =>
    this.session.startFromDay(view);
  protected readonly exportScenario = (): void => this.session.exportScenario();
  protected readonly importFiles = (files: readonly File[]): Promise<void> =>
    this.session.importFiles(files);

  protected async propose(): Promise<void> {
    if (this.proposing()) {
      return;
    }
    this.session.clearMessages();
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

  /**
   * Le chargement d'un véhicule du scénario, quand son nom est celui d'un
   * véhicule actif de la flotte — un nom inventé n'en a pas. Lecture seule :
   * le simulateur ne compare aucune capacité (L2b-C4).
   */
  protected loadBadge(name: string): string | null {
    const vehicle = this.fleetVehicles().find((v) => v.name === name.trim());
    return vehicle === undefined ? null : vehicleBadgeLabel(vehicle);
  }

  private async load(): Promise<void> {
    const readable = canReadDeliverySettings((permission) => this.permissions.can(permission));
    const [fleet, settings] = await Promise.allSettled([
      readable ? this.fleet.vehicles() : Promise.reject(new Error('sans droit')),
      readable ? this.routing.settings() : Promise.reject(new Error('sans droit')),
    ]);
    if (fleet.status === 'fulfilled') {
      this.fleetVehicles.set(fleet.value.vehicles.filter((v) => v.retiredAt === null));
    }
    const prefill: Prefill = {
      vehicles: fleet.status === 'fulfilled' ? activeNames(fleet.value) : [],
      settings: settings.status === 'fulfilled' ? settingsDraftOf(settings.value) : EMPTY_SETTINGS,
      fleetUnread: fleet.status === 'rejected',
      settingsUnread: settings.status === 'rejected',
    };
    this.prefill.set(prefill);
    this.session.replaceDraft(exampleScenario(prefill.vehicles, prefill.settings), null);
  }
}

function activeNames(view: VehiclesView): readonly string[] {
  return view.vehicles
    .filter((vehicle) => vehicle.retiredAt === null)
    .map((vehicle) => vehicle.name)
    .slice(0, SIMULATION_MAX_VEHICLES);
}
