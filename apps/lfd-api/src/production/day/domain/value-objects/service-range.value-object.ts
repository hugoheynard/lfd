import { InvalidServiceRangeError } from "../errors/production-errors.js";
import { ServiceDay } from "./service-day.value-object.js";

/**
 * Le nombre de jours qu'une plage peut porter.
 *
 * Trente-et-un, et pas sept : l'écran ouvre sur `J → J+6`, mais la plage est un
 * paramètre d'URL et le fournil regarde parfois deux semaines avant une fête.
 * La borne existe pour que la matrice reste une matrice — au-delà, on ne voit
 * plus la période d'un coup d'œil, ce qui est la seule chose que cet écran sait
 * faire.
 */
const MAX_DAYS = 31;

/** Une journée en millisecondes — le pas d'avancement, en UTC pur. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * **Une plage de jours de service** — de `from` à `to`, bornes comprises.
 *
 * Un value object plutôt que deux `string` qui voyagent ensemble : « la fin
 * précède le début » est une donnée qui ne doit pas exister, pas une erreur à
 * rattraper plus loin. Construite, une plage est forcément parcourable, et ses
 * jours sortent dans l'ordre chronologique — donc l'ordre des colonnes.
 *
 * ⚠️ **L'arithmétique est faite en UTC, à minuit, et jamais avec l'heure
 * locale.** Un `Date` construit sur une date seule est déjà à minuit UTC ;
 * ajouter 24 h y donne toujours le lendemain, alors qu'un `setDate()` local
 * rendrait deux fois le même jour à un changement d'heure — un samedi
 * fantôme au dernier dimanche d'octobre.
 *
 * Ce n'est pas une lecture de l'horloge : aucune des deux bornes ne vient du
 * mur. Elles viennent de l'appelant, et cette classe ne fait que les découper.
 */
export class ServiceRange {
  private constructor(
    readonly from: ServiceDay,
    readonly to: ServiceDay,
    readonly days: readonly ServiceDay[],
  ) {}

  /**
   * @throws {InvalidServiceDayError} une borne n'est pas un jour ISO.
   * @throws {InvalidServiceRangeError} la fin précède le début, ou la plage est trop longue.
   */
  static of(from: string, to: string): ServiceRange {
    const start = ServiceDay.of(from);
    const end = ServiceDay.of(to);
    // Le tri lexicographique d'un jour ISO EST le tri chronologique — c'est la
    // propriété pour laquelle la journée est stockée en texte.
    if (end.value < start.value) {
      throw new InvalidServiceRangeError(`le ${end.value} précède le ${start.value}`);
    }
    const days = daysBetween(start, end);
    if (days.length > MAX_DAYS) {
      throw new InvalidServiceRangeError(
        `${days.length} jours demandés, ${MAX_DAYS} au maximum — une matrice plus large ne se lit plus d'un coup d'œil`,
      );
    }
    return new ServiceRange(start, end, days);
  }

  /** La position d'un jour dans la plage, ou `-1` — l'index de sa colonne. */
  indexOf(day: string): number {
    return this.days.findIndex((candidate) => candidate.value === day);
  }

  get length(): number {
    return this.days.length;
  }
}

/**
 * Les jours de `start` à `end`, bornes comprises.
 *
 * La borne haute est vérifiée par l'appelant APRÈS coup, et c'est voulu : une
 * plage démesurée doit pouvoir être NOMMÉE dans le refus (« 400 jours
 * demandés »), ce qu'un arrêt en cours de boucle ne permettrait pas.
 */
function daysBetween(start: ServiceDay, end: ServiceDay): readonly ServiceDay[] {
  const days: ServiceDay[] = [];
  const last = Date.parse(`${end.value}T00:00:00.000Z`);
  for (
    let cursor = Date.parse(`${start.value}T00:00:00.000Z`);
    cursor <= last;
    cursor += ONE_DAY_MS
  ) {
    days.push(ServiceDay.of(new Date(cursor).toISOString().slice(0, 10)));
  }
  return days;
}
