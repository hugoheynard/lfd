import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CapabilitiesReport, MissingCapabilityView } from "@lfd/ops-contract";

import type { MissingCapability } from "../../platform/startup/capability-audit.js";
import { CapabilityInventory } from "./capability-inventory.port.js";
import { ReadCapabilitiesQuery } from "./read-capabilities.query.js";

/**
 * Rend l'inventaire au personnel, **les bloquantes d'abord**.
 *
 * Le bulletin met en tête les réglages posés à moitié et en queue ce que les
 * modules ont constaté au démarrage — une bloquante peut donc y suivre une
 * dégradée. Une carte se lit par le haut : le tri est stable, et ne fait que
 * remonter les bloquantes.
 *
 * Le mapping est champ à champ, exprès : un champ ajouté un jour à
 * `MissingCapability` ne part pas vers l'écran sans qu'on l'ait décidé.
 */
@QueryHandler(ReadCapabilitiesQuery)
export class ReadCapabilitiesHandler implements IQueryHandler<
  ReadCapabilitiesQuery,
  CapabilitiesReport
> {
  constructor(private readonly inventory: CapabilityInventory) {}

  execute(): Promise<CapabilitiesReport> {
    const missing = this.inventory.missing().map(toView);
    return Promise.resolve({
      revision: this.inventory.revision(),
      missing: [
        ...missing.filter((entry) => entry.severity === "blocking"),
        ...missing.filter((entry) => entry.severity !== "blocking"),
      ],
    });
  }
}

function toView(entry: MissingCapability): MissingCapabilityView {
  return {
    capability: entry.capability,
    setting: entry.setting,
    consequence: entry.consequence,
    severity: entry.severity,
  };
}
