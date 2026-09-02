import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CatalogRevisionTakenView } from "@lfd/pim-contracts";

import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountingRulesRepository } from "../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { RevisionHashAlreadyTakenError } from "../domain/errors/revision-errors.js";
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
 * La garde demande « **cette ancre existe-t-elle ?** », par son empreinte. Elle
 * demandait « est-ce la DERNIÈRE ? », ce qui en était une approximation — juste
 * tant qu'on ne revient jamais en arrière, fausse dès qu'un catalogue revient à
 * un état qu'il a déjà eu. Un aller-retour A → B → A posait alors une seconde
 * ancre A, et l'histoire du catalogue gagnait un doublon que rien ne distingue
 * de l'original.
 *
 * Un LIBELLÉ ne suffit pas à justifier une nouvelle ancre : nommer différemment
 * un catalogue identique ne le rend pas différent.
 *
 * ⚠️ **Cette garde ne peut pas gagner la course, et elle n'a plus à la gagner.**
 * Deux pushs simultanés lisent tous deux « rien », calculent la même empreinte
 * et écrivent tous deux : la lecture est hors transaction, aucune rédaction
 * applicative n'y changerait quoi que ce soit. C'est `catalog_revision.hash`
 * en `@unique` qui ferme la course — la base refuse, et celui qui perd
 * **rattrape l'ancre du gagnant** au lieu de tomber. Il voulait cette ancre-là ;
 * elle existe ; il l'a.
 *
 * La garde redevient donc ce qu'elle aurait toujours dû être : une optimisation
 * qui évite un aller-retour, pas une ligne de défense.
 *
 * ## Un push échoué ne laisse plus de déchet
 *
 * L'ancre est posée **avant** l'envoi — l'ordre est délibéré : elle dit ce qu'on
 * s'apprête à publier, pas ce qui est parti. Un échec en laisse donc une sans
 * publication. Au retry, l'empreinte la **retrouve** et la publication réussie
 * s'inscrit dessus. Avec l'ancienne garde, la référence était la dernière ancre
 * posée — orpheline comprise — et le doublon n'arrivait que par chance.
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
    const [items, rules] = await Promise.all([this.source.snapshotItems(), this.accounting.read()]);

    // Le rapport entre dans l'en-tête même ABSENT : `null` est un état du
    // catalogue ce jour-là, et le jour où quelqu'un le règle, le diff doit
    // pouvoir montrer le passage de « rien » à « 90 % ».
    const revision = buildRevision(
      { proRatioBp: rules?.rules.proPriceRatio.basisPoints ?? null },
      items,
    );

    // L'empreinte d'abord, la question ensuite : on ne peut pas demander « cette
    // ancre existe-t-elle ? » avant de savoir laquelle. La lecture quitte donc
    // le `Promise.all` — un aller-retour de plus par pose, contre une garde qui
    // pose la bonne question.
    const existing = await this.revisions.byHash(revision.hash);
    if (existing !== null) {
      return {
        id: existing.id,
        reference: existing.reference,
        hash: existing.hash,
        created: false,
      };
    }

    const takenAt = new Date(this.clock.now());
    const takenBy = currentRequestContext()?.actor.id ?? "system";
    // Le fait et l'ancre dans la MÊME transaction. Une ancre est une lecture
    // qu'on enregistre, mais elle s'enregistre : si la trace passait et l'ancre
    // non, l'historique affirmerait une révision que la base ne porte pas.
    const posed = await this.pose(command.label, revision, takenAt, takenBy).catch(
      async (error: unknown) => {
        // Course perdue : un autre push vient de poser exactement cette ancre.
        // On la rattrape plutôt que de rendre une erreur pour un résultat qui
        // est déjà là.
        if (!(error instanceof RevisionHashAlreadyTakenError)) {
          throw error;
        }
        const winner = await this.revisions.byHash(revision.hash);
        if (winner === null) {
          throw error;
        }
        return { id: winner.id, reference: winner.reference, adopted: true as const };
      },
    );
    return {
      id: posed.id,
      reference: posed.reference,
      hash: revision.hash,
      created: !("adopted" in posed),
    };
  }

  /** La trace et l'ancre, dans la même transaction. */
  private async pose(
    label: string | null,
    revision: ReturnType<typeof buildRevision>,
    takenAt: Date,
    takenBy: string,
  ): Promise<{ readonly id: string; readonly reference: string }> {
    return this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.catalogRevisionTaken,
        subjectType: "catalog_revision",
        // Le HASH comme sujet, faute de mieux : la référence est fabriquée par
        // le dépôt, donc inconnue avant l'écriture, et la trace précède
        // l'écriture par construction. L'empreinte désigne la même chose et ne
        // dépend de personne.
        subjectId: revision.hash,
        payload: { hash: revision.hash, label },
        // La portée d'une ancre : combien d'articles elle fige.
        blast: { articles: revision.items.length },
      });
      return this.revisions.save(
        { label, hash: revision.hash, takenAt, takenBy },
        revision,
        ticket,
      );
    });
  }
}
