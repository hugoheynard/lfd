import { Injectable } from "@nestjs/common";

import { LimitScopeNamer } from "../domain/ports/limit-scope.namer.js";
import { LimitTargetLabelsReader } from "../domain/ports/limit-target-labels.reader.js";
import type { LimitScope } from "../domain/value-objects/limit-scope.js";

/** Nomme la cible d'une limite avec les mots de l'écran des réglages. */
@Injectable()
export class PrismaLimitScopeNamer extends LimitScopeNamer {
  constructor(private readonly targets: LimitTargetLabelsReader) {
    super();
  }

  async nameOf(scope: LimitScope): Promise<string | null> {
    if (scope.id === null) {
      return null;
    }
    const labels = await this.targets.labelsOf([{ scopeType: scope.type, scopeId: scope.id }]);
    return labels.get(scope.id) ?? null;
  }
}
