/** Partir d'une vraie journée (`AAAA-MM-JJ`) : ses livraisons COPIÉES en arrêts inventés (L9-C8). */
export class GetSimulationFromDayQuery {
  constructor(readonly day: string) {}
}
