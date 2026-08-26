import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { SalesContextAggregate } from "../domain/entities/sales-context.entity.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";
import { ensureHandleFree, ensureKeyFree } from "./sales-context-support.js";

export interface CreateSalesContextPayload {
  readonly key: string;
  readonly label: string;
  readonly perLocation: boolean;
  readonly handleSuffix: string;
  readonly active: boolean;
  readonly shopifyProjected: boolean;
}

export class CreateSalesContextCommand {
  constructor(readonly payload: CreateSalesContextPayload) {}
}

/**
 * Ouvre un contexte de vente — **le geste que C0 promettait**.
 *
 * « Ajouter un contexte = une ligne, zéro code » s'arrêtait au bord de l'écran :
 * la ligne existait en base, et le registre l'écartait en silence faute de
 * figurer dans une liste écrite en dur. Le verrou est tombé avec C0-d ; celui-ci
 * est la porte qui va avec.
 *
 * Le rang n'est pas demandé : un contexte neuf se pose **en fin de registre**,
 * là où on le cherchera. Le réordonner est un autre geste.
 */
@CommandHandler(CreateSalesContextCommand)
export class CreateSalesContextHandler implements ICommandHandler<
  CreateSalesContextCommand,
  string
> {
  constructor(
    private readonly contexts: SalesContextRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateSalesContextCommand): Promise<string> {
    const { payload } = command;
    // L'agrégat NETTOIE et valide la clé ; on vérifie donc qu'elle est libre
    // sur la version nettoyée, pas sur celle reçue.
    // L'identifiant DÉRIVE de la clé — `ctx_traiteur` — comme les trois lignes
    // que la migration a posées. Un identifiant opaque ne dirait rien de plus
    // et rendrait illisible ce qu'on lit en base, où les taux joignent par lui.
    const context = SalesContextAggregate.open({
      id: `ctx_${payload.key.trim()}`,
      ...payload,
      position: await this.contexts.nextPosition(),
    });
    const created = context.snapshot();
    await ensureKeyFree(this.contexts, created.key);
    await ensureHandleFree(this.contexts, created);

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.salesContextCreated,
        subjectType: "sales_context",
        subjectId: created.key,
        // L'agrégat, pas la charge reçue : le journal doit dire ce qui a été
        // écrit. Un libellé entouré d'espaces s'y inscrirait sinon tel quel.
        payload: {
          key: created.key,
          label: created.label,
          perLocation: created.perLocation,
          active: created.active,
          shopifyProjected: created.shopifyProjected,
        },
      });
      await this.contexts.add(context, ticket);
    });
    return created.key;
  }
}
