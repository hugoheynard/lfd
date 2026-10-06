import { type HouseTimeRole, InvalidHouseTimeError } from "../errors/production-settings-errors.js";

const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u;
const MINUTES_PER_HOUR = 60;

/** Les minutes d'une journée — une heure de pendule s'y ramène. */
export const MINUTES_IN_DAY = 24 * MINUTES_PER_HOUR;

/**
 * **Une heure de la maison** — `HH:MM` sur 24 h, heure de pendule d'Europe/Paris.
 *
 * Ni un instant ni un `Date` : une heure de réglage vaut pour tous les jours,
 * été comme hiver. Elle se compare en minutes depuis minuit.
 */
export class HouseTime {
  private constructor(
    readonly value: string,
    readonly minutes: number,
  ) {}

  /** @throws {InvalidHouseTimeError} la chaîne n'est pas `HH:MM`. */
  static of(raw: string, role: HouseTimeRole): HouseTime {
    const match = CLOCK_TIME.exec(raw.trim());
    if (match === null) {
      throw new InvalidHouseTimeError(role, raw);
    }
    const [, hours, minutes] = match;
    return new HouseTime(raw.trim(), Number(hours) * MINUTES_PER_HOUR + Number(minutes));
  }

  /** L'heure d'un nombre de minutes depuis minuit, ramené dans la journée. */
  static fromMinutes(minutes: number): HouseTime {
    const inDay = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    const hours = Math.floor(inDay / MINUTES_PER_HOUR);
    const rest = inDay % MINUTES_PER_HOUR;
    return new HouseTime(`${pad(hours)}:${pad(rest)}`, inDay);
  }

  isBefore(other: HouseTime): boolean {
    return this.minutes < other.minutes;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
