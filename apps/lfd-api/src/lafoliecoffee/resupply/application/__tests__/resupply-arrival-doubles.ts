import { ResupplyArrivalSuggestions } from "../../domain/resupply-arrival-suggestions.js";

/**
 * Une heure d'arrivée requise par point, fixée par le test, quel que soit le
 * jour ; garde les jours demandés pour qu'un test dise lequel a été lu.
 */
export class FixedResupplyArrivals extends ResupplyArrivalSuggestions {
  readonly askedDays: string[] = [];

  constructor(private readonly bySite: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  requiredArrivals(day: string, siteIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    this.askedDays.push(day);
    const known = siteIds.flatMap((id) => {
      const arrival = this.bySite.get(id);
      return arrival === undefined ? [] : [[id, arrival] as const];
    });
    return Promise.resolve(new Map(known));
  }
}

/** L'heure d'arrivée qu'une visée porte à l'envoi (H-D2) : une heure pour demain, aucune au plus tôt. */
export function arrivalFor(target: "asap" | "tomorrow"): string | null {
  return target === "tomorrow" ? "06:30" : null;
}
