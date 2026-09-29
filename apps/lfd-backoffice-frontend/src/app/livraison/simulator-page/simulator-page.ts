import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  DeliveryRoutingSettingsPayload,
  DeliverySimulationFromDayView,
  DeliverySimulationView,
  SaveDeliverySimulationScenarioPayload,
  VehiclesView,
} from '@lfd/contracts';
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
import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { DayImport } from '../day-import/day-import';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { DeliverySimulationScenariosService } from '../delivery-simulation-scenarios.service';
import {
  buildPayload,
  copyNameOf,
  draftKey,
  type DepartureChoice,
  EMPTY_SETTINGS,
  emptyStop,
  exampleScenario,
  importScenario,
  parseGps,
  SCENARIO_FILE_NAME,
  scenarioFileContent,
  type ScenarioDraft,
  scenarioDraftOf,
  scenarioNameError,
  type SettingsDraft,
  SIMULATION_MAX_STOP_MINUTES,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
  SIMULATION_MIN_STOP_MINUTES,
  settingsDraftOf,
  type StopDraft,
} from '../delivery-simulator';
import { SimulationResult } from '../simulation-result/simulation-result';
import { SimulationScenarios } from '../simulation-scenarios/simulation-scenarios';

/** Le scénario enregistré d'où vient l'écran (L9-C7). */
interface CurrentScenario {
  readonly id: string;
  readonly name: string;
}

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
  private readonly notify = inject(NotifyService);
  private readonly scenarios = inject(DeliverySimulationScenariosService);

  protected readonly prefill = signal<Prefill | null>(null);
  protected readonly draft = signal<ScenarioDraft>(exampleScenario([], EMPTY_SETTINGS));
  protected readonly proposing = signal(false);
  protected readonly errors = signal<readonly string[]>([]);
  protected readonly refusal = signal<string | null>(null);
  protected readonly importRefusal = signal<string | null>(null);
  protected readonly result = signal<Simulated | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_rounds:write'));
  protected readonly current = signal<CurrentScenario | null>(null);
  /** L'empreinte du dernier état enregistré, ouvert ou chargé. */
  private readonly baseline = signal('');
  protected readonly modified = computed(() => draftKey(this.draft()) !== this.baseline());
  protected readonly revision = signal(0);
  protected readonly saveAsOpen = signal(false);
  protected readonly saveName = signal('');
  protected readonly saving = signal(false);
  protected readonly saveRefusal = signal<string | null>(null);
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
    this.replaceDraft(
      exampleScenario(prefill?.vehicles ?? [], prefill?.settings ?? EMPTY_SETTINGS),
      null,
    );
    this.clearMessages();
  }

  /** « Enregistrer » : remplace le scénario ouvert ; sans lui, c'est « Enregistrer sous… ». */
  protected async save(): Promise<void> {
    const current = this.current();
    if (current === null) {
      this.openSaveAs();
      return;
    }
    await this.write(current.name, (payload) =>
      this.scenarios.replace(current.id, payload).then(() => current.id),
    );
  }

  protected openSaveAs(): void {
    this.saveName.set(copyNameOf(this.current()?.name ?? null));
    this.saveRefusal.set(null);
    this.saveAsOpen.set(true);
  }

  protected async saveAs(): Promise<void> {
    const name = this.saveName().trim();
    const fault = scenarioNameError(name);
    if (fault !== null) {
      this.saveRefusal.set(fault);
      return;
    }
    await this.write(name, (payload) => this.scenarios.create(payload));
  }

  protected async openScenario(id: string): Promise<void> {
    this.clearMessages();
    try {
      const view = await this.scenarios.open(id);
      this.replaceDraft(scenarioDraftOf(view.scenario), { id: view.id, name: view.name });
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Ce scénario n’a pas pu être ouvert.'));
    }
  }

  /** Archivé, le scénario ouvert n'existe plus pour l'équipe : l'écran l'oublie. */
  protected forget(id: string): void {
    if (this.current()?.id === id) {
      this.current.set(null);
    }
  }

  protected startFromDay(view: DeliverySimulationFromDayView): void {
    this.clearMessages();
    this.replaceDraft(scenarioDraftOf(view.scenario), null);
    this.notify.success(`Journée du ${view.day} copiée dans le simulateur.`);
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
    this.replaceDraft(imported.draft, null);
    this.notify.success(`Scénario « ${file.name} » importé.`);
  }

  /** Un scénario neuf à l'écran : il devient l'état de référence. */
  private replaceDraft(draft: ScenarioDraft, current: CurrentScenario | null): void {
    this.draft.set(draft);
    this.baseline.set(draftKey(draft));
    this.current.set(current);
    this.result.set(null);
    this.saveAsOpen.set(false);
  }

  private async write(
    name: string,
    send: (payload: SaveDeliverySimulationScenarioPayload) => Promise<string>,
  ): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.clearMessages();
    this.saveRefusal.set(null);
    const draft = this.draft();
    const built = buildPayload(draft);
    if (!built.ok) {
      this.errors.set(built.errors);
      return;
    }
    this.saving.set(true);
    try {
      const id = await send({ name, scenario: built.payload });
      this.current.set({ id, name });
      this.baseline.set(draftKey(draft));
      this.saveAsOpen.set(false);
      this.revision.update((n) => n + 1);
      this.notify.success(`Scénario « ${name} » enregistré.`);
    } catch (error) {
      const message = httpErrorMessage(error, 'Le scénario n’a pas pu être enregistré.');
      if (this.saveAsOpen()) {
        this.saveRefusal.set(message);
      } else {
        this.refusal.set(message);
      }
    } finally {
      this.saving.set(false);
    }
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
    const readable = canReadDeliverySettings((permission) => this.permissions.can(permission));
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
    this.replaceDraft(exampleScenario(prefill.vehicles, prefill.settings), null);
  }
}

function activeNames(view: VehiclesView): readonly string[] {
  return view.vehicles
    .filter((vehicle) => vehicle.retiredAt === null)
    .map((vehicle) => vehicle.name)
    .slice(0, SIMULATION_MAX_VEHICLES);
}
