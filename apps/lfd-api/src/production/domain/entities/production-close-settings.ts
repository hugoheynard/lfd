import {
  AlertTimeRequiredError,
  CloseTimeBeforeOrderCutoffError,
  CloseTimeOutOfRangeError,
  CloseTimeRequiredError,
} from "../errors/production-settings-errors.js";
import {
  closesBeforeCutoff,
  describeCutoff,
  type LatestOrderCutoff,
} from "../services/latest-order-cutoff.js";
import { HouseTime } from "../value-objects/house-time.value-object.js";

/** `auto` : le serveur arrête le plan du lendemain ; `manual` : on alerte qui doit l'arrêter. */
export type CloseMode = "auto" | "manual";

/** Ce que le réglage dit — la forme du journal et de la lecture. */
export interface CloseSettingsValues {
  readonly mode: CloseMode;
  readonly closeAt: string | null;
  readonly alertAt: string | null;
}

/** La forme relue en base. `updatedBy` / `updatedAt` : `null` tant que personne n'a réglé. */
export interface CloseSettingsState extends CloseSettingsValues {
  readonly updatedBy: string | null;
  readonly updatedAt: Date | null;
}

/** Ce qu'on demande de poser. Les heures arrivent brutes : l'agrégat les juge. */
export interface CloseSettingsRequest {
  readonly mode: CloseMode;
  readonly closeAt: string | null;
  readonly alertAt: string | null;
}

/** Un changement effectif : ce qui valait, ce qui vaut. */
export interface CloseSettingsChange {
  readonly before: CloseSettingsValues;
  readonly after: CloseSettingsValues;
}

/** S4 : l'arrêt automatique se règle entre midi et 23:55. */
const EARLIEST_CLOSE = HouseTime.of("12:00", "close");
const LATEST_CLOSE = HouseTime.of("23:55", "close");

/** Q1 (Hugo, 2026-10-06) : on part en manuel, alerte à 20:00. */
const INITIAL_ALERT = "20:00";

/**
 * **L'arrêt du plan, automatique ou manuel** — le réglage unique du fournil
 * (plan `documentation/production/plan-arret-du-plan.md`, §2, Q5, S4).
 *
 * Un agrégat et pas un CRUD : des règles REFUSENT l'écriture — le mode sans
 * son heure, une heure mal formée, une heure d'arrêt hors de `12:00`–`23:55`
 * ou antérieure à l'heure limite de commande la plus tardive. La limite vit au
 * commerce ; le handler la lit par le canal et la passe à {@link change}.
 *
 * L'heure de l'autre mode est gardée telle quelle, jugée sur sa forme et ses
 * bornes : repasser en automatique la retrouve.
 */
export class ProductionCloseSettings {
  private constructor(private state: CloseSettingsState) {}

  /** Le réglage de départ, tant que personne n'a rien posé (Q1). */
  static initial(): ProductionCloseSettings {
    return new ProductionCloseSettings({
      mode: "manual",
      closeAt: null,
      alertAt: INITIAL_ALERT,
      updatedBy: null,
      updatedAt: null,
    });
  }

  static restore(state: CloseSettingsState): ProductionCloseSettings {
    return new ProductionCloseSettings(state);
  }

  get values(): CloseSettingsValues {
    return { mode: this.state.mode, closeAt: this.state.closeAt, alertAt: this.state.alertAt };
  }

  get updatedBy(): string | null {
    return this.state.updatedBy;
  }

  get updatedAt(): Date | null {
    return this.state.updatedAt;
  }

  /**
   * Pose un réglage. Rend le changement, ou `null` s'il est identique — rien
   * n'est alors écrit ni journalisé.
   *
   * @param cutoff l'heure limite de commande la plus tardive ; `null` = aucune.
   * @throws {InvalidHouseTimeError} une heure n'est pas `HH:MM`.
   * @throws {CloseTimeRequiredError} automatique sans heure d'arrêt.
   * @throws {AlertTimeRequiredError} manuel sans heure d'alerte.
   * @throws {CloseTimeOutOfRangeError} heure d'arrêt hors de `12:00`–`23:55`.
   * @throws {CloseTimeBeforeOrderCutoffError} automatique, avant l'heure limite.
   */
  change(
    request: CloseSettingsRequest,
    cutoff: LatestOrderCutoff | null,
    by: string,
    at: Date,
  ): CloseSettingsChange | null {
    const closeAt = closeTimeOf(request.closeAt);
    const alertAt = request.alertAt === null ? null : HouseTime.of(request.alertAt, "alert");
    if (request.mode === "auto") {
      refuseAutoWithout(closeAt, cutoff);
    } else if (alertAt === null) {
      throw new AlertTimeRequiredError();
    }
    const after: CloseSettingsValues = {
      mode: request.mode,
      closeAt: closeAt?.value ?? null,
      alertAt: alertAt?.value ?? null,
    };
    const before = this.values;
    if (sameValues(before, after)) {
      return null;
    }
    this.state = { ...after, updatedBy: by, updatedAt: at };
    return { before, after };
  }
}

/** L'heure d'arrêt, jugée sur sa forme et ses bornes dès qu'elle est donnée. */
function closeTimeOf(raw: string | null): HouseTime | null {
  if (raw === null) {
    return null;
  }
  const closeAt = HouseTime.of(raw, "close");
  if (closeAt.isBefore(EARLIEST_CLOSE) || LATEST_CLOSE.isBefore(closeAt)) {
    throw new CloseTimeOutOfRangeError(closeAt.value, EARLIEST_CLOSE.value, LATEST_CLOSE.value);
  }
  return closeAt;
}

function refuseAutoWithout(closeAt: HouseTime | null, cutoff: LatestOrderCutoff | null): void {
  if (closeAt === null) {
    throw new CloseTimeRequiredError();
  }
  if (cutoff !== null && closesBeforeCutoff(closeAt, cutoff)) {
    throw new CloseTimeBeforeOrderCutoffError(closeAt.value, describeCutoff(cutoff));
  }
}

function sameValues(a: CloseSettingsValues, b: CloseSettingsValues): boolean {
  return a.mode === b.mode && a.closeAt === b.closeAt && a.alertAt === b.alertAt;
}
