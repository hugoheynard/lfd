import { InvalidRoutingSettingError } from "../errors/delivery-routing-errors.js";
import { minutesOfDay } from "./clock-time.js";

/**
 * Les deux façons de « Proposer » (Hugo, 2026-09-29 : « ça devrait être un
 * choix back-office ») : INSÉRER les commandes à répartir dans les tournées
 * existantes, sans réordonner ce qu'on a placé à la main ; ou ouvrir des
 * tournées NEUVES.
 */
export const PROPOSAL_MODES = ["insert", "new_rounds"] as const;
export type ProposalMode = (typeof PROPOSAL_MODES)[number];

export function isProposalMode(value: string): value is ProposalMode {
  return PROPOSAL_MODES.some((mode) => mode === value);
}

/** Les réglages du calcul, tels qu'on les saisit et qu'on les relit. */
export interface RoutingSettingsValues {
  /** Le facteur de détour en centièmes : 140 = ×1,4. */
  readonly detourPercent: number;
  readonly averageSpeedKmh: number;
  /** `HH:MM`, heure de Paris. */
  readonly earliestDeparture: string;
  readonly maxRoundMinutes: number;
  readonly stopMinutes: number;
  /** Le mode de « Proposer » quand l'écran n'en demande pas. */
  readonly defaultMode: ProposalMode;
  /** Un véhicule peut-il faire plusieurs tournées dans la journée (Q13) ? */
  readonly multiplePassages: boolean;
  /**
   * La marge de sécurité avant la fin d'un créneau, en minutes (lot 7 ter,
   * L7t-C1) : une arrivée dans ces minutes-là coûte au calcul.
   */
  readonly safetyMarginMinutes: number;
}

/** Une borne entière, avec la phrase qui la dit. */
interface IntegerBound {
  readonly min: number;
  readonly max: number;
  readonly words: string;
}

const BOUNDED_FIELDS = [
  "detourPercent",
  "averageSpeedKmh",
  "maxRoundMinutes",
  "stopMinutes",
  "safetyMarginMinutes",
] as const;

const BOUNDS: Readonly<Record<(typeof BOUNDED_FIELDS)[number], IntegerBound>> = {
  detourPercent: {
    min: 100,
    max: 300,
    words: "le facteur de détour tient entre ×1,00 (la ligne droite) et ×3,00",
  },
  averageSpeedKmh: { min: 5, max: 130, words: "la vitesse moyenne tient entre 5 et 130 km/h" },
  maxRoundMinutes: {
    min: 30,
    max: 720,
    words: "la durée maximale d'une tournée tient entre 30 minutes et 12 heures",
  },
  stopMinutes: { min: 0, max: 60, words: "le temps d'arrêt tient entre 0 et 60 minutes" },
  safetyMarginMinutes: {
    min: 0,
    max: 90,
    words: "la marge de sécurité avant la fin d'un créneau tient entre 0 et 90 minutes",
  },
};

/**
 * **Les réglages du calcul de tournée** (lot 7, L7-C13, L7-C15) — un value
 * object : immuable, refusé à la construction s'il sort de ses bornes.
 *
 * Les défauts sont ceux de Hugo (2026-09-29) : ×1,4 et 35 km/h « comme point
 * de départ, à recaler sur les premières tournées réelles », départ au plus
 * tôt 06:00, 240 minutes au plus, 5 minutes par livraison ; la marge de
 * sécurité de 20 minutes avant la fin d'un créneau est de Hugo aussi (lot 7
 * ter, L7t-C1 : « un bouchon au pied d'une station en hiver mange un quart
 * d'heure »). Le mode par défaut
 * (tournées neuves, plusieurs passages permis) est celui qui existait avant le
 * choix — Hugo ne sait pas encore s'il livrera plusieurs fois. Ils VALENT tant que
 * personne n'a réglé — précédent `DeliveryAvailability`.
 */
export class RoutingSettings implements RoutingSettingsValues {
  static readonly DEFAULTS: RoutingSettingsValues = {
    detourPercent: 140,
    averageSpeedKmh: 35,
    earliestDeparture: "06:00",
    maxRoundMinutes: 240,
    stopMinutes: 5,
    defaultMode: "new_rounds",
    multiplePassages: true,
    safetyMarginMinutes: 20,
  };

  private constructor(
    readonly detourPercent: number,
    readonly averageSpeedKmh: number,
    readonly earliestDeparture: string,
    readonly maxRoundMinutes: number,
    readonly stopMinutes: number,
    readonly defaultMode: ProposalMode,
    readonly multiplePassages: boolean,
    readonly safetyMarginMinutes: number,
    /** Minutes depuis minuit de l'heure au plus tôt. */
    readonly earliestDepartureMinute: number,
  ) {}

  /** Les valeurs d'usine. */
  static defaults(): RoutingSettings {
    return RoutingSettings.define(RoutingSettings.DEFAULTS);
  }

  /** @throws {InvalidRoutingSettingError} une valeur hors de ses bornes. */
  static define(values: RoutingSettingsValues): RoutingSettings {
    for (const field of BOUNDED_FIELDS) {
      const bound = BOUNDS[field];
      const value = values[field];
      if (!Number.isInteger(value) || value < bound.min || value > bound.max) {
        throw new InvalidRoutingSettingError(`${bound.words} (saisi : ${String(value)}).`);
      }
    }
    const earliest = minutesOfDay(values.earliestDeparture);
    if (earliest === null) {
      throw new InvalidRoutingSettingError(
        `l'heure de départ au plus tôt s'écrit HH:MM (saisi : « ${values.earliestDeparture} »).`,
      );
    }
    if (!isProposalMode(values.defaultMode)) {
      throw new InvalidRoutingSettingError(
        `le mode de proposition vaut « insert » ou « new_rounds » (saisi : « ${String(values.defaultMode)} »).`,
      );
    }
    return new RoutingSettings(
      values.detourPercent,
      values.averageSpeedKmh,
      values.earliestDeparture,
      values.maxRoundMinutes,
      values.stopMinutes,
      values.defaultMode,
      values.multiplePassages,
      values.safetyMarginMinutes,
      earliest,
    );
  }

  /** Les valeurs saisies, sans rien de dérivé. */
  values(): RoutingSettingsValues {
    return {
      detourPercent: this.detourPercent,
      averageSpeedKmh: this.averageSpeedKmh,
      earliestDeparture: this.earliestDeparture,
      maxRoundMinutes: this.maxRoundMinutes,
      stopMinutes: this.stopMinutes,
      defaultMode: this.defaultMode,
      multiplePassages: this.multiplePassages,
      safetyMarginMinutes: this.safetyMarginMinutes,
    };
  }
}
