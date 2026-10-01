import { DriverRoundWall } from "../../domain/ports/driver-round-wall.js";

/** Le mur du livreur, en mémoire : les paires (livreur, tournée) affectées. */
export class FixedDriverWall extends DriverRoundWall {
  readonly asked: string[] = [];

  constructor(private readonly assigned: ReadonlyMap<string, string>) {
    super();
  }

  isAssigned(staffUserId: string, roundId: string): Promise<boolean> {
    this.asked.push(`${staffUserId}:${roundId}`);
    return Promise.resolve(this.assigned.get(roundId) === staffUserId);
  }
}
