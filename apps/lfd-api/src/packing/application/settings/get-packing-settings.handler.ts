import type { PackingSettingsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PackingSettings } from "../../domain/entities/packing-settings.js";
import { PackingSettingsReader } from "../../domain/ports/packing-settings.reader.js";
import { GetPackingSettingsQuery } from "./get-packing-settings.query.js";

/**
 * Les réglages du colisage tels qu'ils valent : ceux qu'on a posés, sinon les
 * défauts — partage d'une moitié fermé. Lu par Réglages › Colisage et par le
 * poste, qui n'affiche « Partager une moitié » que s'il est ouvert.
 */
@QueryHandler(GetPackingSettingsQuery)
export class GetPackingSettingsHandler implements IQueryHandler<
  GetPackingSettingsQuery,
  PackingSettingsView
> {
  constructor(private readonly reader: PackingSettingsReader) {}

  async execute(): Promise<PackingSettingsView> {
    const posed = await this.reader.current();
    const settings = posed ?? PackingSettings.defaults();
    return { halfSharing: settings.halfSharing, source: posed === null ? "default" : "explicit" };
  }
}
