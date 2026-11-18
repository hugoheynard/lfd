import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
  type FoldSelectItem,
  type FoldViewToggleOption,
} from 'fold-ng';

import {
  PRODUCTION_TRACKING_LEVELS,
  type ProductionTrackingLevel,
  type ProductionTrackingView,
  type WorkstationView,
} from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { ProductionSettingsService } from '../../../production/production-settings.service';
import { serverMessageOf } from '../../../production/server-message';
import { WorkstationsService } from '../../../production/workstations.service';
import { GestureIntents } from '../../../shared/gesture-intents';

const LEVEL_LABEL: Readonly<Record<ProductionTrackingLevel, string>> = {
  always_green: 'Toujours vert',
  simple: 'Simple',
  detailed: 'Détaillé',
};

/** Le choix « suit le fournil » d'un poste : `null` côté serveur. */
const INHERIT = 'inherit';
type StationChoice = ProductionTrackingLevel | typeof INHERIT;

type LoadState = 'loading' | 'ready' | 'error';

/** « 1 janvier 2027 », à l'heure de Paris. */
const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

function isLevel(value: string): value is ProductionTrackingLevel {
  return PRODUCTION_TRACKING_LEVELS.some((level) => level === value);
}

/**
 * **La page « Niveau de suivi »** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : le
 * niveau du fournil et sa marge, puis le niveau propre de chaque poste.
 *
 * Elle rassemble deux propriétaires : le réglage du fournil s'écrit chez
 * l'atelier (`PUT …/settings/tracking`), le niveau d'un poste chez les postes
 * (`PUT …/workstations/:id/tracking-level`). Chaque écriture part sous la clé
 * d'une {@link GestureIntents}, tenue par contenu, puis la page relit.
 */
@Component({
  selector: 'app-tracking-levels-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './tracking-levels-page.html',
  styleUrl: './tracking-levels-page.scss',
})
export class TrackingLevelsPage {
  private readonly settings = inject(ProductionSettingsService);
  private readonly workstations = inject(WorkstationsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  protected readonly state = signal<LoadState>('loading');
  protected readonly tracking = signal<ProductionTrackingView | null>(null);
  /** Les postes ; `null` : leur lecture a échoué (ou n'est pas permise). */
  protected readonly stations = signal<readonly WorkstationView[] | null>(null);

  /** Le brouillon du fournil, posé à chaque lecture. */
  protected readonly level = signal<ProductionTrackingLevel>('always_green');
  protected readonly margin = signal<number | null>(null);

  protected readonly saving = signal(false);
  protected readonly savingStation = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);

  protected readonly canWriteTracking = computed(() =>
    this.permissions.can('production_settings:write'),
  );
  protected readonly canWriteStations = computed(() =>
    this.permissions.can('production_workstations:write'),
  );

  protected readonly levelOptions: readonly FoldViewToggleOption[] = PRODUCTION_TRACKING_LEVELS.map(
    (value) => ({ value, label: LEVEL_LABEL[value] }),
  );

  /** « Suit le fournil (Toujours vert) », puis les trois niveaux. */
  protected readonly stationOptions = computed<readonly FoldSelectItem<StationChoice>[]>(() => {
    const fournil = this.tracking()?.level ?? null;
    return [
      {
        value: INHERIT,
        label: fournil === null ? 'Suit le fournil' : `Suit le fournil (${LEVEL_LABEL[fournil]})`,
      },
      ...PRODUCTION_TRACKING_LEVELS.map((value) => ({ value, label: LEVEL_LABEL[value] })),
    ];
  });

  /** « 1 janvier 2027 » — la mise en service, quand elle n'est pas passée. */
  protected readonly notYet = computed(() => {
    const tracking = this.tracking();
    return tracking === null || tracking.inService
      ? null
      : DAY_FORMAT.format(new Date(tracking.inServiceSince));
  });

  /** Le brouillon diffère-t-il de ce qui est enregistré ? Rien à envoyer, rien à cliquer. */
  protected readonly dirty = computed(() => {
    const tracking = this.tracking();
    return (
      tracking !== null &&
      (this.level() !== tracking.level || this.margin() !== tracking.marginMinutes)
    );
  });

  /** Le niveau en vigueur, en mots, pour qui ne peut pas le changer. */
  protected readonly levelLabel = computed(() => LEVEL_LABEL[this.level()]);

  protected readonly canSave = computed(() => {
    const margin = this.margin();
    return (
      this.canWriteTracking() &&
      this.dirty() &&
      !this.saving() &&
      margin !== null &&
      Number.isInteger(margin) &&
      margin >= 0
    );
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.apply(await this.settings.tracking());
    } catch {
      this.state.set('error');
      return;
    }
    await this.readStations();
    this.state.set('ready');
  }

  protected chooseLevel(value: string): void {
    if (isLevel(value)) {
      this.level.set(value);
    }
  }

  protected stationChoice(station: WorkstationView): StationChoice {
    return station.trackingLevel ?? INHERIT;
  }

  protected async save(): Promise<void> {
    const margin = this.margin();
    if (!this.canSave() || margin === null) {
      return;
    }
    const payload = { level: this.level(), marginMinutes: margin };
    const subject = `tracking|${payload.level}|${String(margin)}`;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.settings.saveTracking(payload, this.intents.keyFor(subject));
      this.intents.done(subject);
    } catch (error) {
      this.refusal.set(`Le niveau du fournil n'a pas été enregistré : ${serverMessageOf(error)}`);
      this.saving.set(false);
      return;
    }
    try {
      this.apply(await this.settings.tracking());
    } catch {
      this.refusal.set(
        "Le niveau du fournil est enregistré, mais n'a pas pu être relu : rechargez la page pour le voir.",
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async setStation(station: WorkstationView, choice: StationChoice): Promise<void> {
    const level = choice === INHERIT ? null : choice;
    if (level === station.trackingLevel || this.savingStation() !== null) {
      return;
    }
    const subject = `station|${station.id}|${choice}`;
    this.savingStation.set(station.id);
    this.refusal.set(null);
    try {
      await this.workstations.setTrackingLevel(station.id, level, this.intents.keyFor(subject));
      this.intents.done(subject);
    } catch (error) {
      this.refusal.set(
        `Le niveau du poste ${station.name} n'a pas été enregistré : ${serverMessageOf(error)}`,
      );
    }
    try {
      // Relu après un succès comme après un refus : la liste remontre l'état réel.
      await this.readStations();
    } finally {
      this.savingStation.set(null);
    }
  }

  private apply(tracking: ProductionTrackingView): void {
    this.tracking.set(tracking);
    this.level.set(tracking.level);
    this.margin.set(tracking.marginMinutes);
  }

  private async readStations(): Promise<void> {
    try {
      // Une nouvelle référence par poste : la liste se redessine même si la valeur servie n'a pas changé.
      this.stations.set((await this.workstations.page()).workstations.map((s) => ({ ...s })));
    } catch {
      this.stations.set(null);
    }
  }
}
