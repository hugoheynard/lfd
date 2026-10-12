import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PayerBillingModeView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillingPayerNotFoundError } from "../../domain/errors/billing-mode-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { payerBillingModeView } from "../billing-modes-view-support.js";
import { GetPayerBillingModeQuery } from "./get-payer-billing-mode.query.js";

/**
 * Le mode d'un payeur : en vigueur (mensuel s'il n'a rien choisi), programmé,
 * verrou, et ses trois prochaines clôtures — lues sur sa propre suite, bascule
 * de mode et de dates comprises. Un site facturé ailleurs se lit aussi : il
 * dit « mensuel » sans qu'on l'en déduise payeur, c'est la route d'écriture
 * qui le refuse.
 */
@QueryHandler(GetPayerBillingModeQuery)
export class GetPayerBillingModeHandler implements IQueryHandler<
  GetPayerBillingModeQuery,
  PayerBillingModeView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly standings: PayerStandingReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetPayerBillingModeQuery): Promise<PayerBillingModeView> {
    if ((await this.entities.byId(query.legalEntityId)) === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    const now = this.clock.now();
    if ((await this.standings.standingOf(query.payerCompanyId, now)) === null) {
      throw new BillingPayerNotFoundError(query.payerCompanyId);
    }
    const segments = await this.payerModes.segmentsOfPayer(
      query.legalEntityId,
      query.payerCompanyId,
    );
    return payerBillingModeView(
      query.legalEntityId,
      { payerCompanyId: query.payerCompanyId, segments },
      await this.modeDates.timelinesOf(query.legalEntityId),
      now,
    );
  }
}
