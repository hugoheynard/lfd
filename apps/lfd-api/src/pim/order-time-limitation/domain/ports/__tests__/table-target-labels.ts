import { LimitTargetLabelsReader, type ScopeTarget } from "../limit-target-labels.reader.js";

/**
 * Le double des noms du catalogue : une table identifiant → nom ; une cible
 * absente de la table ne se nomme pas. Garde les lectures demandées.
 */
export class TableTargetLabels extends LimitTargetLabelsReader {
  readonly asked: (readonly ScopeTarget[])[] = [];

  constructor(private readonly names: Readonly<Record<string, string>> = {}) {
    super();
  }

  labelsOf(targets: readonly ScopeTarget[]): Promise<ReadonlyMap<string, string>> {
    this.asked.push(targets);
    const found = targets.flatMap((target) => {
      const name = target.scopeId === null ? undefined : this.names[target.scopeId];
      return target.scopeId === null || name === undefined ? [] : [[target.scopeId, name] as const];
    });
    return Promise.resolve(new Map(found));
  }
}
