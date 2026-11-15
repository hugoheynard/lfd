import { ProductionDayStatusReader } from "../../domain/ports/production-day-status.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * L'en-tête lu PAR le dépôt doublé : `isClosed` passe par `load`, comme la
 * lecture hors verrou d'avant le 2026-11-02. Les specs qui comptent les
 * `load` d'une séquence gardent ainsi leur trace ; celles qui veulent prouver
 * que l'en-tête seul est lu prennent un statut à part.
 */
export class RepositoryBackedStatus extends ProductionDayStatusReader {
  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async isClosed(day: ServiceDay): Promise<boolean> {
    return (await this.days.load(day)).isClosed;
  }
}

/**
 * Un en-tête qui dit ce qu'on lui dit, quelle que soit la journée — l'en-tête
 * PÉRIMÉ d'une course : lu « arrêtée » hors verrou, la journée a été rouverte
 * avant que le verrou soit obtenu.
 */
export class FixedStatus extends ProductionDayStatusReader {
  constructor(
    private readonly closed: boolean,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  isClosed(): Promise<boolean> {
    this.trace.push("status");
    return Promise.resolve(this.closed);
  }
}
