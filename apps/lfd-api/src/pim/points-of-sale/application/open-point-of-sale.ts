import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { PointOfSale } from "../domain/entities/point-of-sale.js";
import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";

export interface OpenPointOfSalePayload {
  readonly kind: "shop" | "platform";
  readonly label: string;
  readonly baseUrl: string;
  /** Ce que la boutique OFFRE — les clés de contexte, telles que le registre les porte. */
  readonly contexts: readonly string[];
  readonly tableCount: number;
}

export class OpenPointOfSaleCommand {
  constructor(readonly payload: OpenPointOfSalePayload) {}
}

/**
 * Ouvre un point de vente — boutique ou plateforme.
 *
 * Les deux genres passent par ici : une plateforme n'est pas un cas d'exception,
 * c'est l'autre valeur du genre. Seule la **racine** est à part — semée au boot
 * et ineffaçable, comme le contexte de vente racine.
 */
@CommandHandler(OpenPointOfSaleCommand)
export class OpenPointOfSaleHandler implements ICommandHandler<OpenPointOfSaleCommand, string> {
  constructor(
    private readonly points: PointOfSaleRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: OpenPointOfSaleCommand): Promise<string> {
    const id = this.ids.next();
    const pointOfSale = PointOfSale.open({ id, ...command.payload });
    // Le journal lit l'AGRÉGAT, pas la charge reçue : un nom entouré d'espaces
    // s'y inscrirait tel quel alors que la base garde le nom nettoyé. Le journal
    // doit dire ce qui a été écrit, pas ce qui a été demandé.
    const opened = pointOfSale.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.pointOfSaleCreated,
        subjectType: "point_of_sale",
        subjectId: id,
        payload: {
          kind: opened.kind,
          label: opened.label,
          contexts: [...opened.contexts],
          tableCount: opened.tables.length,
        },
      });
      await this.points.add(pointOfSale, ticket);
    });
    return id;
  }
}
