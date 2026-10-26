import { QualityControlDisabledError } from "../errors/quality-control-settings-errors.js";
import type { QualityCheckTarget } from "../value-objects/quality-check-target.js";

/** Les deux niveaux où un verdict se rend (`plan-controle-qualite.md`, §0). */
export type QualityControlLevel = QualityCheckTarget["kind"];

/** Ce que dit le refus, par niveau — lu au fournil, sans le code sous les yeux. */
const LEVEL_LABELS: Readonly<Record<QualityControlLevel, string>> = {
  line: "au fournil (lignes de préparation)",
  order: "au colisage (commandes colisées)",
};

/** Les deux interrupteurs, tels qu'ils se posent et se lisent. */
export interface QualityControlSettingsState {
  /** « Contrôle qualité au fournil » — les lignes de préparation. */
  readonly lineChecks: boolean;
  /** « Contrôle qualité au colisage » — les commandes colisées. */
  readonly orderChecks: boolean;
}

/**
 * **Où le contrôle qualité se rend** — Réglages › Commandes (décision de Hugo,
 * 2026-10-26). Pas d'agrégat à transitions : un réglage, mais qui REFUSE un
 * verdict — la règle vit donc ici, et non dans le handler qui l'appelle.
 *
 * Désactiver un niveau n'efface rien : les verdicts déjà rendus restent lisibles,
 * et une retenue Bloquante déjà posée reste jusqu'à sa levée (cf. le plan,
 * D10). Elle se lève en réactivant le niveau le temps de rendre un nouveau
 * verdict.
 */
export class QualityControlSettings {
  private constructor(
    readonly lineChecks: boolean,
    readonly orderChecks: boolean,
  ) {}

  /** Personne n'a rien réglé : fournil désactivé, colisage activé (le comportement d'avant). */
  static defaults(): QualityControlSettings {
    return new QualityControlSettings(false, true);
  }

  static of(values: QualityControlSettingsState): QualityControlSettings {
    return new QualityControlSettings(values.lineChecks, values.orderChecks);
  }

  enabledFor(level: QualityControlLevel): boolean {
    return level === "line" ? this.lineChecks : this.orderChecks;
  }

  /** @throws {QualityControlDisabledError} le niveau visé est désactivé. */
  assertCanCheck(level: QualityControlLevel): void {
    if (!this.enabledFor(level)) {
      throw new QualityControlDisabledError(LEVEL_LABELS[level]);
    }
  }

  equals(other: QualityControlSettings): boolean {
    return this.lineChecks === other.lineChecks && this.orderChecks === other.orderChecks;
  }
}
