import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { VatRate } from "../domain/entities/vat-rate.js";
import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";
import { ensureRateFree } from "./vat-support.js";

export interface VatRatePayload {
  readonly name: string;
  readonly description?: string | undefined;
  readonly percent: number;
}

export class CreateVatRateCommand {
  constructor(readonly payload: VatRatePayload) {}
}

@CommandHandler(CreateVatRateCommand)
export class CreateVatRateHandler implements ICommandHandler<CreateVatRateCommand, string> {
  constructor(
    private readonly rates: VatRateRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * L'agrégat naît d'abord — il valide le taux — et c'est CE taux qu'on
   * confronte aux autres. L'ordre compte : chercher une collision avant de
   * savoir le taux valide reviendrait à comparer un nombre qui n'en est pas un.
   */
  async execute(command: CreateVatRateCommand): Promise<string> {
    const { payload } = command;
    const rate = VatRate.open({
      id: this.ids.next(),
      name: payload.name,
      description: payload.description ?? "",
      percent: payload.percent,
    });
    await ensureRateFree(this.rates, rate.percent, null);
    await this.uow.run(async () => {
      // Pas de portée : un taux qui naît ne vise encore aucune famille.
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.vatRateCreated,
        subjectType: "tva_rate",
        subjectId: rate.id,
        payload: { name: payload.name, percent: payload.percent },
      });
      await this.rates.add(rate, ticket);
    });
    return rate.id;
  }
}
