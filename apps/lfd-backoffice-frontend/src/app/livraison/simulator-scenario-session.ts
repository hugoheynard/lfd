import { computed, inject, signal } from '@angular/core';
import type {
  DeliveryRoutingSettingsPayload,
  DeliverySimulationFromDayView,
  DeliverySimulationView,
  SaveDeliverySimulationScenarioPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { NotifyService } from '../notify.service';
import { saveBlob } from '../shared/download/save-blob';
import { DeliverySimulationScenariosService } from './delivery-simulation-scenarios.service';
import {
  buildPayload,
  copyNameOf,
  draftKey,
  EMPTY_SETTINGS,
  exampleScenario,
  importScenario,
  SCENARIO_FILE_NAME,
  scenarioFileContent,
  type ScenarioDraft,
  scenarioDraftOf,
  scenarioNameError,
} from './delivery-simulator';

/** Le scénario enregistré d'où vient l'écran (L9-C7). */
export interface CurrentScenario {
  readonly id: string;
  readonly name: string;
}

export interface Simulated {
  readonly view: DeliverySimulationView;
  readonly settings: DeliveryRoutingSettingsPayload;
}

/**
 * Le scénario à l'écran du simulateur et son enregistrement (L9-C7) : le
 * brouillon, son état de référence, les messages, « Enregistrer / sous… »,
 * et ce qui le fait entrer ou sortir (ouvrir, copier une journée, fichier).
 *
 * Sorti de `SimulatorPage` pour que la page ne garde que la saisie et les
 * lectures ; la page en ré-expose les signaux sous leurs noms, si bien que le
 * gabarit ne change pas. Construite dans le contexte d'injection de la page
 * (initialiseur de champ) : c'est ce qui l'autorise à appeler `inject()`.
 */
export class SimulatorScenarioSession {
  private readonly notify = inject(NotifyService);
  private readonly scenarios = inject(DeliverySimulationScenariosService);

  readonly draft = signal<ScenarioDraft>(exampleScenario([], EMPTY_SETTINGS));
  readonly errors = signal<readonly string[]>([]);
  readonly refusal = signal<string | null>(null);
  readonly importRefusal = signal<string | null>(null);
  readonly result = signal<Simulated | null>(null);

  readonly current = signal<CurrentScenario | null>(null);
  /** L'empreinte du dernier état enregistré, ouvert ou chargé. */
  private readonly baseline = signal('');
  readonly modified = computed(() => draftKey(this.draft()) !== this.baseline());
  readonly revision = signal(0);
  readonly saveAsOpen = signal(false);
  readonly saveName = signal('');
  readonly saving = signal(false);
  readonly saveRefusal = signal<string | null>(null);

  /** « Enregistrer » : remplace le scénario ouvert ; sans lui, c'est « Enregistrer sous… ». */
  async save(): Promise<void> {
    const current = this.current();
    if (current === null) {
      this.openSaveAs();
      return;
    }
    await this.write(current.name, (payload) =>
      this.scenarios.replace(current.id, payload).then(() => current.id),
    );
  }

  openSaveAs(): void {
    this.saveName.set(copyNameOf(this.current()?.name ?? null));
    this.saveRefusal.set(null);
    this.saveAsOpen.set(true);
  }

  async saveAs(): Promise<void> {
    const name = this.saveName().trim();
    const fault = scenarioNameError(name);
    if (fault !== null) {
      this.saveRefusal.set(fault);
      return;
    }
    await this.write(name, (payload) => this.scenarios.create(payload));
  }

  async openScenario(id: string): Promise<void> {
    this.clearMessages();
    try {
      const view = await this.scenarios.open(id);
      this.replaceDraft(scenarioDraftOf(view.scenario), { id: view.id, name: view.name });
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Ce scénario n’a pas pu être ouvert.'));
    }
  }

  /** Archivé, le scénario ouvert n'existe plus pour l'équipe : l'écran l'oublie. */
  forget(id: string): void {
    if (this.current()?.id === id) {
      this.current.set(null);
    }
  }

  startFromDay(view: DeliverySimulationFromDayView): void {
    this.clearMessages();
    this.replaceDraft(scenarioDraftOf(view.scenario), null);
    this.notify.success(`Journée du ${view.day} copiée dans le simulateur.`);
  }

  exportScenario(): void {
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

  async importFiles(files: readonly File[]): Promise<void> {
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
  replaceDraft(draft: ScenarioDraft, current: CurrentScenario | null): void {
    this.draft.set(draft);
    this.baseline.set(draftKey(draft));
    this.current.set(current);
    this.result.set(null);
    this.saveAsOpen.set(false);
  }

  patch(patch: Partial<ScenarioDraft>): void {
    this.draft.set({ ...this.draft(), ...patch });
  }

  clearMessages(): void {
    this.errors.set([]);
    this.refusal.set(null);
    this.importRefusal.set(null);
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
}
