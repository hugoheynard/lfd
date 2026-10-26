import type { QualityControlSettingsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { QualityControlSettings } from "../../domain/entities/quality-control-settings.js";
import { QualityControlSettingsReader } from "../../domain/ports/quality-control-settings.reader.js";
import { GetQualityControlSettingsQuery } from "./get-quality-control-settings.query.js";

/**
 * Les réglages du contrôle qualité tels qu'ils valent : ceux qu'on a posés,
 * sinon les défauts — fournil désactivé, colisage activé. Lu par Réglages ›
 * Commandes. Il n'écrit rien.
 */
@QueryHandler(GetQualityControlSettingsQuery)
export class GetQualityControlSettingsHandler implements IQueryHandler<
  GetQualityControlSettingsQuery,
  QualityControlSettingsView
> {
  constructor(private readonly reader: QualityControlSettingsReader) {}

  async execute(): Promise<QualityControlSettingsView> {
    const posed = await this.reader.current();
    const settings = posed ?? QualityControlSettings.defaults();
    return {
      lineChecks: settings.lineChecks,
      orderChecks: settings.orderChecks,
      source: posed === null ? "default" : "explicit",
    };
  }
}
