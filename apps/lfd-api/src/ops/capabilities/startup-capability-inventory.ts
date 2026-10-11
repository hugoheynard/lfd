import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import type { MissingCapability } from "../../platform/startup/capability-audit.js";
import { StartupReport } from "../../platform/startup/startup-report.service.js";
import { CapabilityInventory } from "./capability-inventory.port.js";

/**
 * L'inventaire lu à **la même source** que la route d'exploitation au jeton :
 * le bulletin de démarrage. Aucune règle n'est recopiée ici — une capacité
 * ajoutée à `capability-audit.ts` apparaît sur la carte sans autre geste.
 */
@Injectable()
export class StartupCapabilityInventory extends CapabilityInventory {
  constructor(
    private readonly report: StartupReport,
    private readonly config: AppConfig,
  ) {
    super();
  }

  revision(): string {
    return this.config.revision();
  }

  missing(): readonly MissingCapability[] {
    return this.report.missing();
  }
}
