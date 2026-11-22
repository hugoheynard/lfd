import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { type PayLinkOriginEntry, PayLinkOrigins } from "../domain/ports/pay-link-origins.js";

/** Le registre des origines de la configuration, racines résolues au démarrage. */
@Injectable()
export class ConfiguredPayLinkOrigins extends PayLinkOrigins {
  private readonly byName: ReadonlyMap<string, PayLinkOriginEntry>;

  constructor(config: AppConfig) {
    super();
    this.byName = new Map(config.payLinkOrigins().map((origin) => [origin.name, origin]));
  }

  find(name: string): PayLinkOriginEntry | null {
    return this.byName.get(name) ?? null;
  }
}
