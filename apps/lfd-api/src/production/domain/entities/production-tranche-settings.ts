import {
  DuplicateTrancheError,
  InvalidTrancheTimeError,
  TooManyTranchesError,
  UnknownTrancheModeError,
} from "../errors/production-tranches-errors.js";

/** `fixed` : les heures réglées ; `computed` : les heures des besoins (plan des tranches, §2). */
export const TRANCHE_MODES = ["fixed", "computed"] as const;
export type TrancheMode = (typeof TRANCHE_MODES)[number];

/** Au plus huit heures fixes : au-delà, ce ne sont plus des repères d'atelier (§4). */
export const MAX_FIXED_TRANCHES = 8;

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

/** L'état tel qu'il se pose, se lit et se journalise. */
export interface ProductionTrancheSettingsState {
  readonly mode: TrancheMode;
  /** `HH:mm`, triées, sans doublon. */
  readonly fixedTranches: readonly string[];
}

/**
 * **Les tranches de production** — Réglages › Production (plan
 * `documentation/fournil/plan-tranches-de-production.md`, T1).
 *
 * Un réglage, mais qui REFUSE une écriture (forme, doublon, borne) : la règle
 * vit donc ici. Les heures fixes sont gardées en mode calculé — repasser au
 * fixe retrouve les repères de l'atelier. Le tri est structurel : l'état
 * construit est toujours trié, quel que soit l'ordre de saisie.
 */
export class ProductionTrancheSettings implements ProductionTrancheSettingsState {
  private constructor(
    readonly mode: TrancheMode,
    readonly fixedTranches: readonly string[],
  ) {}

  /** Personne n'a rien réglé : mode fixe, aucune heure — une seule tranche, la journée (§2.2). */
  static defaults(): ProductionTrancheSettings {
    return new ProductionTrancheSettings("fixed", []);
  }

  /**
   * @throws {UnknownTrancheModeError} le mode n'est ni `fixed` ni `computed`.
   * @throws {InvalidTrancheTimeError} une heure n'est pas `HH:mm`.
   * @throws {DuplicateTrancheError} la même heure deux fois.
   * @throws {TooManyTranchesError} plus de {@link MAX_FIXED_TRANCHES} heures.
   */
  static set(mode: string, fixedTranches: readonly string[]): ProductionTrancheSettings {
    return new ProductionTrancheSettings(modeOf(mode), tranchesOf(fixedTranches));
  }

  equals(other: ProductionTrancheSettingsState): boolean {
    return (
      this.mode === other.mode &&
      this.fixedTranches.length === other.fixedTranches.length &&
      this.fixedTranches.every((time, index) => other.fixedTranches[index] === time)
    );
  }
}

function modeOf(raw: string): TrancheMode {
  const mode = TRANCHE_MODES.find((candidate) => candidate === raw);
  if (mode === undefined) {
    throw new UnknownTrancheModeError(raw);
  }
  return mode;
}

function tranchesOf(raw: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const value of raw) {
    const time = value.trim();
    if (!CLOCK_TIME.test(time)) {
      throw new InvalidTrancheTimeError(value);
    }
    if (seen.has(time)) {
      throw new DuplicateTrancheError(time);
    }
    seen.add(time);
  }
  if (seen.size > MAX_FIXED_TRANCHES) {
    throw new TooManyTranchesError(seen.size, MAX_FIXED_TRANCHES);
  }
  return [...seen].sort();
}
