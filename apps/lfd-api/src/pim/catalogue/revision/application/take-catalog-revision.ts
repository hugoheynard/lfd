import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CatalogRevisionTakenView } from "@lfd/pim-contracts";

import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountingRulesRepository } from "../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogRevisionRepository } from "../domain/ports/catalog-revision.repository.js";
import { buildRevision } from "../domain/revision.js";
import { CatalogRevisionSource } from "../domain/ports/catalog-revision.source.js";

/** Ce qu'une capture rend : l'ancre posée, ou celle qui existait déjà. */
export type TakenRevision = CatalogRevisionTakenView;

export class TakeCatalogRevisionCommand {
  constructor(readonly label: string | null) {}
}

/**
 * **Poser un point d'ancrage sur le catalogue.**
 *
 * Une photographie, pas une modification : rien du catalogue ne change, et
 * c'est ce qui permet de la poser aussi souvent qu'on veut.
 *
 * ## Une capture identique ne pose rien
 *
 * L'empreinte de la révision est comparée à celle de la dernière. Égales, on
 * rend l'ancre existante sans en créer une seconde. Sans cette garde, un bouton
 * cliqué deux fois créerait deux ancres indiscernables, et l'histoire du
 * catalogue deviendrait une liste de doublons dans laquelle plus personne ne
 * retrouve la version qui compte.
 *
 * Un LIBELLÉ ne suffit pas à justifier une nouvelle ancre : nommer différemment
 * un catalogue identique ne le rend pas différent.
 */
@CommandHandler(TakeCatalogRevisionCommand)
export class TakeCatalogRevisionHandler implements ICommandHandler<
  TakeCatalogRevisionCommand,
  TakenRevision
> {
  constructor(
    private readonly source: CatalogRevisionSource,
    private readonly revisions: CatalogRevisionRepository,
    private readonly accounting: AccountingRulesRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: TakeCatalogRevisionCommand): Promise<TakenRevision> {
    const [items, rules, latest] = await Promise.all([
      this.source.snapshotItems(),
      this.accounting.read(),
      this.revisions.latest(),
    ]);

    // Le rapport entre dans l'en-tête même ABSENT : `null` est un état du
    // catalogue ce jour-là, et le jour où quelqu'un le règle, le diff doit
    // pouvoir montrer le passage de « rien » à « 90 % ».
    const revision = buildRevision(
      { proRatioBp: rules?.rules.proPriceRatio.basisPoints ?? null },
      items,
    );

    if (latest !== null && latest.hash === revision.hash) {
      return { id: latest.id, version: latest.version, hash: latest.hash, created: false };
    }

    const takenAt = new Date(this.clock.now());
    const takenBy = currentRequestContext()?.actor.id ?? "system";
    const version = (latest?.version ?? 0) + 1;

    // Le fait et l'ancre dans la MÊME transaction. Une ancre est une lecture
    // qu'on enregistre, mais elle s'enregistre : si la trace passait et l'ancre
    // non, l'historique affirmerait une révision que la base ne porte pas.
    const id = await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.catalogRevisionTaken,
        subjectType: "catalog_revision",
        subjectId: `v${String(version)}`,
        payload: { version, hash: revision.hash, label: command.label },
        // La portée d'une ancre : combien d'articles elle fige.
        blast: { articles: revision.items.length },
      });
      return this.revisions.save(
        { version, label: command.label, hash: revision.hash, takenAt, takenBy },
        revision,
        ticket,
      );
    });
    return { id, version, hash: revision.hash, created: true };
  }
}
