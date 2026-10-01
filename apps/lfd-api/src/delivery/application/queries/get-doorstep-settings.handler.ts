import { DEFAULT_DOORSTEP_RULE, type DoorstepSettingsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DoorstepSettingsReader } from "../../domain/ports/doorstep-settings.reader.js";
import { GetDoorstepSettingsQuery } from "./get-doorstep-settings.query.js";

/** Le réglage global à la porte tel qu'il vaut : celui qu'on a posé, sinon « Me demander ». */
@QueryHandler(GetDoorstepSettingsQuery)
export class GetDoorstepSettingsHandler implements IQueryHandler<
  GetDoorstepSettingsQuery,
  DoorstepSettingsView
> {
  constructor(private readonly reader: DoorstepSettingsReader) {}

  async execute(): Promise<DoorstepSettingsView> {
    const rule = await this.reader.current();
    return rule === null
      ? { rule: DEFAULT_DOORSTEP_RULE, source: "default" }
      : { rule, source: "explicit" };
  }
}
