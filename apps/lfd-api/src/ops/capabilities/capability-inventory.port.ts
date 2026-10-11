import type { MissingCapability } from "../../platform/startup/capability-audit.js";

/**
 * Ce que la carte « Capacités » a besoin de savoir : quelle image répond, et ce
 * qu'elle ne sait pas faire. Un port étroit plutôt que `StartupReport` et
 * `AppConfig` en direct : le handler se teste sans fabriquer d'environnement.
 */
export abstract class CapabilityInventory {
  abstract revision(): string;
  abstract missing(): readonly MissingCapability[];
}
