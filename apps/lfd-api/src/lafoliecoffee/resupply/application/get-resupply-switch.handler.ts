import type { ResupplySwitchView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { RESUPPLY_ENABLED_BY_DEFAULT } from "../domain/resupply-switch.js";
import { ResupplySwitchReader } from "../domain/resupply-switch.reader.js";
import { GetResupplySwitchQuery } from "./get-resupply-switch.query.js";

/**
 * Sert l'interrupteur : éteint et sans auteur tant qu'il n'a jamais été posé.
 * Le comptoir et le fournil le lisent pour savoir s'ils montrent leurs écrans.
 */
@QueryHandler(GetResupplySwitchQuery)
export class GetResupplySwitchHandler implements IQueryHandler<
  GetResupplySwitchQuery,
  ResupplySwitchView
> {
  constructor(private readonly switches: ResupplySwitchReader) {}

  async execute(): Promise<ResupplySwitchView> {
    const posed = await this.switches.read();
    return {
      enabled: posed?.enabled ?? RESUPPLY_ENABLED_BY_DEFAULT,
      updatedAt: posed?.updated.at.toISOString() ?? null,
      updatedBy: posed?.updated.author.name ?? null,
    };
  }
}
