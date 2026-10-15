import { CatalogRulesEmitter } from "../catalog-rules.emitter.js";

/**
 * Le double de l'émetteur des règles (lot 2b) : il appelle une sonde à chaque
 * émission, pour que le test dise ce qui était DÉJÀ écrit à cet instant.
 * Hérite du port, comme les autres doubles du dépôt.
 */
export class RecordingRulesEmitter extends CatalogRulesEmitter {
  readonly emissions: number[] = [];

  constructor(private readonly probe: () => number = () => 0) {
    super();
  }

  emitRules(): Promise<void> {
    this.emissions.push(this.probe());
    return Promise.resolve();
  }
}
