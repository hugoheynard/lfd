import type { CounterAccountCeilingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { CounterAccountCeilingSettingReader } from "../../domain/ports/counter-account-ceiling-setting.reader.js";
import { GetCounterAccountCeilingQuery } from "./get-counter-account-ceiling.query.js";

/**
 * Sert le réglage du plafond (§ 3.3) : le montant, l'instant et l'auteur,
 * nommé par l'annuaire d'aujourd'hui — `null` s'il ne le connaît pas, et
 * l'écran garde l'identifiant.
 */
@QueryHandler(GetCounterAccountCeilingQuery)
export class GetCounterAccountCeilingHandler implements IQueryHandler<
  GetCounterAccountCeilingQuery,
  CounterAccountCeilingView
> {
  constructor(
    private readonly settings: CounterAccountCeilingSettingReader,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(): Promise<CounterAccountCeilingView> {
    const current = await this.settings.current();
    const authors = await this.authors.identify([current.updatedByStaffId]);
    return {
      ceilingCents: current.ceilingCents,
      updatedAt: current.updatedAt?.toISOString() ?? null,
      updatedByStaffId: current.updatedByStaffId,
      updatedByName: authors.nameOf(current.updatedByStaffId),
    };
  }
}
