import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal, type WriteTicket } from "../../journal/pim-journal.js";
import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";
import type { VatRatePayload } from "./create-vat-rate.js";
import { ensureRateFree, requireRate } from "./vat-support.js";

export class UpdateVatRateCommand {
  constructor(
    readonly id: string,
    readonly payload: VatRatePayload,
  ) {}
}

@CommandHandler(UpdateVatRateCommand)
export class UpdateVatRateHandler implements ICommandHandler<UpdateVatRateCommand, void> {
  constructor(
    private readonly rates: VatRateRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Le taux d'AVANT est lu avant la révision : après, l'agrégat ne s'en souvient
   * plus, et un journal qui ne dit pas d'où l'on vient ne sert à rien.
   */
  async execute(command: UpdateVatRateCommand): Promise<void> {
    const rate = await requireRate(this.rates, command.id);
    const before = rate.snapshot();
    const { payload } = command;

    rate.revise({
      name: payload.name,
      description: payload.description ?? "",
      percent: payload.percent,
    });

    await ensureRateFree(this.rates, rate.percent, rate.id);

    await this.uow.run(async () => {
      const ticket = await this.journalize(before, rate.snapshot());
      await this.rates.save(rate, ticket);
    });
  }

  /**
   * Deux faits distincts, parce qu'ils n'ont pas le même aval : un taux qui
   * bouge change ce qui est facturé, un nom qui change ne change rien. Les
   * confondre sous un « taux modifié » obligerait à ouvrir le payload pour
   * savoir si l'événement compte.
   */
  /**
   * Un seul laissez-passer, alors que ce geste peut inscrire DEUX faits (le
   * taux et le nom bougent indépendamment). C'est le premier qui l'ouvre : le
   * ticket atteste qu'une trace existe, il ne les compte pas.
   */
  private async journalize(
    before: { name: string; percent: number },
    after: { id: string; name: string; percent: number },
  ): Promise<WriteTicket> {
    const tickets: WriteTicket[] = [];
    if (before.percent !== after.percent) {
      // La portée : ce que ce taux touchait à l'instant du changement.
      const usage = (await this.rates.usageByRegime()).get(after.id);
      tickets.push(
        await this.journal.trace({
          type: PIM_EVENTS.vatRateRateChanged,
          subjectType: "vat_rate",
          subjectId: after.id,
          payload: { name: after.name, from: before.percent, to: after.percent },
          // TOUS les contextes, nommés par leur clé. Le journal en listait
          // trois, fixes : un taux que seules les familles B2B visaient
          // changeait sous une portée annoncée « 0 / 0 » — sous la promesse que
          // ça ne touchait personne. Un contexte ajouté demain y sera sans
          // qu'on y pense.
          blast: { families: { ...(usage ?? {}) } },
        }),
      );
    }
    if (before.name !== after.name) {
      tickets.push(
        await this.journal.trace({
          type: PIM_EVENTS.vatRateRenamed,
          subjectType: "vat_rate",
          subjectId: after.id,
          payload: { from: before.name, to: after.name },
        }),
      );
    }
    return tickets[0] ?? this.journal.untraced("taux enregistré sans modification");
  }
}
