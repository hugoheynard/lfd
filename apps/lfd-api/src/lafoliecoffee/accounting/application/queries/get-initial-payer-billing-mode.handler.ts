import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { InitialPayerBillingModeView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { BillingPayerNotFoundError } from "../../domain/errors/billing-mode-errors.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { isBillingPayerAt } from "../../domain/services/billing-payer-guard.js";
import { lastChosenMode } from "../../domain/services/payer-timeline.js";
import { GetInitialPayerBillingModeQuery } from "./get-initial-payer-billing-mode.query.js";

/**
 * Le **premier choix** du mode, vu depuis la fiche d'un compte (décidé par
 * Hugo le 2026-11-12) : les entités en service, le mode déjà choisi chez
 * chacune, et si ce compte a un mode à choisir. Les règles sont celles du
 * geste : « choisi » est le dernier segment vivant écrit (`chooseFirst`),
 * « payeur » est le critère de `requireBillingPayer`.
 *
 * @throws {BillingPayerNotFoundError} le compte n'existe pas.
 */
@QueryHandler(GetInitialPayerBillingModeQuery)
export class GetInitialPayerBillingModeHandler implements IQueryHandler<
  GetInitialPayerBillingModeQuery,
  InitialPayerBillingModeView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly standings: PayerStandingReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetInitialPayerBillingModeQuery): Promise<InitialPayerBillingModeView> {
    const now = this.clock.now();
    const standing = await this.standings.standingOf(query.companyId, now);
    if (standing === null) {
      throw new BillingPayerNotFoundError(query.companyId);
    }
    const living = (await this.entities.list()).filter((entity) => entity.archivedAt === null);
    const chosen = await Promise.all(
      living.map(async (entity) => ({
        legalEntityId: entity.id,
        mode: lastChosenMode(await this.payerModes.segmentsOfPayer(entity.id, query.companyId)),
      })),
    );
    return {
      entities: living.map((entity) => ({ id: entity.id, name: entity.name })),
      chosen: chosen.flatMap(({ legalEntityId, mode }) =>
        mode === null ? [] : [{ legalEntityId, mode }],
      ),
      requiresChoice: isBillingPayerAt(standing, now),
    };
  }
}
