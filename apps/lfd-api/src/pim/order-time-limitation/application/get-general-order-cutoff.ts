import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { GeneralOrderCutoffView } from "@lfd/pim-contracts";

import { GeneralOrderCutoffReader } from "../../channels/b2b-platform/general-order-cutoff/general-order-cutoff.reader.js";

export class GetGeneralOrderCutoffQuery {}

/**
 * La règle générale du commerce, pour l'en-tête de la page des limites de
 * commande. Lecture pure, par le port que le référentiel déclare — depuis le
 * 2026-10-21, « toute la production » ne se règle plus ici.
 */
@QueryHandler(GetGeneralOrderCutoffQuery)
export class GetGeneralOrderCutoffHandler implements IQueryHandler<
  GetGeneralOrderCutoffQuery,
  GeneralOrderCutoffView
> {
  constructor(private readonly general: GeneralOrderCutoffReader) {}

  async execute(): Promise<GeneralOrderCutoffView> {
    return this.general.read();
  }
}
