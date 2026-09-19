import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LimitScopeNamer } from "../domain/ports/limit-scope.namer.js";
import type { LimitScope } from "../domain/value-objects/limit-scope.js";
import { targetLabels } from "./target-labels.js";

/** Nomme la cible d'une limite avec les mots de l'écran des réglages. */
@Injectable()
export class PrismaLimitScopeNamer extends LimitScopeNamer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(scope: LimitScope): Promise<string | null> {
    if (scope.id === null) {
      return null;
    }
    const labels = await targetLabels(this.prisma, [{ scopeType: scope.type, scopeId: scope.id }]);
    return labels.get(scope.id) ?? null;
  }
}
