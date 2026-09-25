import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { DynamicFloorPayload, PriceFloorView, PriceMode } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { formatEuros } from '@lfd/catalog-ui';

import {
  doorLabel,
  magnitudeFromWire,
  magnitudeToWire,
} from '../../../b2b/tarification/pricing-format';

/** Ce que la saisie produit, déjà dans les unités du fil. */
export interface FloorValueDraft {
  readonly mode: PriceMode;
  /** Points de base si `percent`, millicentimes si `amount`. */
  readonly value: number;
  readonly dynamic: DynamicFloorPayload | null;
}

/** Au-delà, ce n'est plus un plancher : ça relèverait TOUS les prix. */
const MAX_PERCENT = 100;
/** `10000` points de base = ×1. */
const BASIS_POINTS_PER_UNIT = 10_000;

const UNIT_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'amount', label: '€ — un montant' },
  { value: 'percent', label: '% — du tarif' },
];

/**
 * **La valeur d'une limite, et sa porte** — la saisie commune au panneau d'une
 * limite et à la pose groupée.
 *
 * La **porte** est facultative : un plancher plus bas, que le volume ouvre.
 * Une nouvelle porte se saisit dans l'unité du mur.
 *
 * 🔴 **Une porte déjà posée est GARDÉE telle quelle** — valeur, unité, clés —
 * et renvoyée inchangée tant qu'on ne la modifie ni ne la retire
 * explicitement. Le panneau d'origine envoyait `dynamic: null` à chaque pose,
 * et une première reprise laissait vide une porte d'une autre unité : deux
 * façons d'effacer une décision d'argent sans que personne l'ait demandé.
 * Changer l'unité du mur sous une porte gardée bloque l'enregistrement et le
 * dit, jusqu'au geste explicite.
 *
 * Rend `null` tant que la saisie n'est pas envoyable : le parent n'a rien à
 * revalider.
 */
@Component({
  selector: 'app-floor-value-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInputComponent, FoldViewToggleComponent],
  templateUrl: './floor-value-form.html',
  styleUrl: './floor-value-form.scss',
})
export class FloorValueForm {
  /** Un montant n'a de sens que sur une unité — cf. le panneau. */
  readonly unitScoped = input(false);
  readonly disabled = input(false);
  /** La limite déjà posée, pour amorcer la saisie. */
  readonly initial = input<PriceFloorView | null>(null);
  /** Le tarif, pour montrer ce qu'une fraction donnerait. `null` au-delà d'un article. */
  readonly canonicalMillicents = input<number | null>(null);

  readonly draftChange = output<FloorValueDraft | null>();

  protected readonly mode = signal<PriceMode>('percent');
  protected readonly amount = signal<number | null>(null);
  protected readonly doorAmount = signal<number | null>(null);
  protected readonly doorQuantity = signal<number | null>(null);
  protected readonly doorRatio = signal<number | null>(null);
  /** La porte posée, gardée INCHANGÉE tant qu'on n'y touche pas. */
  protected readonly keptDoor = signal<DynamicFloorPayload | null>(null);
  /** L'unité du mur à l'ouverture — un changement d'unité se juge contre elle. */
  private readonly initialMode = signal<PriceMode | null>(null);

  protected readonly keptDoorLabel = computed(() => {
    const door = this.keptDoor();
    return door === null ? '' : doorLabel(door);
  });

  /**
   * L'unité du mur a CHANGÉ sous une porte gardée d'une autre unité : la porte
   * ne peut plus se lire contre le mur. On ne l'efface pas en silence, on le dit.
   */
  protected readonly doorConflict = computed(() => {
    const door = this.keptDoor();
    return door !== null && door.mode !== this.mode() && this.mode() !== this.initialMode();
  });

  protected readonly unitOptions = computed<readonly FoldViewToggleOption[]>(() =>
    UNIT_OPTIONS.map((option) => ({ ...option, disabled: this.disabled() })),
  );

  protected readonly preview = computed(() => {
    const canonical = this.canonicalMillicents();
    const value = this.amount();
    if (canonical === null || value === null || this.mode() !== 'percent') {
      return null;
    }
    return formatEuros(Math.round((canonical * value) / MAX_PERCENT));
  });

  protected readonly overHundred = computed(
    () => this.mode() === 'percent' && (this.amount() ?? 0) > MAX_PERCENT,
  );

  /** La porte a une valeur mais pas de clé, ou n'est pas sous le mur. */
  protected readonly doorProblem = computed<string | null>(() => {
    if (this.doorConflict()) {
      return "Changer d'unité : la porte actuelle sera retirée. Retirez-la ou saisissez-la à nouveau pour enregistrer.";
    }
    const kept = this.keptDoor();
    if (kept !== null) {
      const wall = this.amount();
      return kept.mode === this.mode() &&
        wall !== null &&
        kept.value >= magnitudeToWire(wall, kept.mode)
        ? 'La porte est un plancher plus BAS que le mur.'
        : null;
    }
    const door = this.doorAmount();
    if (door === null) {
      return null;
    }
    if (this.doorQuantity() === null && this.doorRatio() === null) {
      return 'Une porte s’ouvre par une quantité, un volume, ou les deux.';
    }
    const wall = this.amount();
    if (door <= 0 || (wall !== null && door >= wall)) {
      return 'La porte est un plancher plus BAS que le mur.';
    }
    return null;
  });

  protected readonly draft = computed<FloorValueDraft | null>(() => {
    const value = this.amount();
    const mode = this.mode();
    if (value === null || value <= 0 || this.overHundred() || this.doorProblem() !== null) {
      return null;
    }
    return { mode, value: magnitudeToWire(value, mode), dynamic: this.dynamic(mode) };
  });

  constructor() {
    // Amorçage à chaque NOUVELLE limite visée — pas à chaque frappe : la saisie
    // en cours ne dépend pas de `initial`.
    effect(() => {
      const initial = this.initial();
      const unitScoped = this.unitScoped();
      untracked(() => this.seed(initial, unitScoped));
    });
    effect(() => this.draftChange.emit(this.draft()));
  }

  protected setMode(value: string): void {
    const next: PriceMode = value === 'amount' ? 'amount' : 'percent';
    if (this.disabled() || (next === 'amount' && !this.unitScoped())) {
      return;
    }
    this.mode.set(next);
  }

  protected setAmount(value: string): void {
    this.amount.set(parseDecimal(value));
  }

  protected setDoorAmount(value: string): void {
    this.doorAmount.set(parseDecimal(value));
  }

  protected setDoorQuantity(value: string): void {
    const parsed = parseDecimal(value);
    this.doorQuantity.set(parsed === null ? null : Math.round(parsed));
  }

  protected setDoorRatio(value: string): void {
    this.doorRatio.set(parseDecimal(value));
  }

  protected show(value: number | null): string {
    return value === null ? '' : String(value).replace('.', ',');
  }

  /** Retirer la porte, explicitement : la pose partira sans. */
  protected dropDoor(): void {
    this.keptDoor.set(null);
    this.clearDoorFields();
  }

  /** Ressaisir la porte dans l'unité du mur ; même unité, on part de sa valeur. */
  protected editDoor(): void {
    const door = this.keptDoor();
    this.keptDoor.set(null);
    if (door === null || door.mode !== this.mode()) {
      this.clearDoorFields();
      return;
    }
    this.doorAmount.set(magnitudeFromWire(door.value, door.mode));
    this.doorQuantity.set(door.unlock.minQuantity);
    const ratio = door.unlock.minVolumeRatioBp;
    this.doorRatio.set(ratio === null ? null : ratio / BASIS_POINTS_PER_UNIT);
  }

  private clearDoorFields(): void {
    this.doorAmount.set(null);
    this.doorQuantity.set(null);
    this.doorRatio.set(null);
  }

  private dynamic(mode: PriceMode): DynamicFloorPayload | null {
    const kept = this.keptDoor();
    if (kept !== null) {
      return kept;
    }
    const door = this.doorAmount();
    if (door === null) {
      return null;
    }
    const ratio = this.doorRatio();
    return {
      mode,
      value: magnitudeToWire(door, mode),
      unlock: {
        minQuantity: this.doorQuantity(),
        minVolumeRatioBp: ratio === null ? null : Math.round(ratio * BASIS_POINTS_PER_UNIT),
      },
    };
  }

  private seed(initial: PriceFloorView | null, unitScoped: boolean): void {
    this.clearDoorFields();
    if (initial === null) {
      this.mode.set(unitScoped ? 'amount' : 'percent');
      this.initialMode.set(null);
      this.amount.set(null);
      this.keptDoor.set(null);
      return;
    }
    this.mode.set(initial.mode);
    this.initialMode.set(initial.mode);
    this.amount.set(magnitudeFromWire(initial.value, initial.mode));
    this.keptDoor.set(initial.dynamic);
  }
}

function parseDecimal(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return value.trim() === '' || Number.isNaN(parsed) ? null : parsed;
}
