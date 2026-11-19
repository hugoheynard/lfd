import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CatalogRevisionTakenView } from "@lfd/pim-contracts";

import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { referenceFrom } from "../../../../platform/id/reference.js";
import { UuidGenerator } from "../../../../platform/id/uuid-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogRevision } from "../domain/entities/catalog-revision.js";
import { RevisionHashAlreadyTakenError } from "../domain/errors/revision-errors.js";
import { CatalogRevisionRepository } from "../domain/ports/catalog-revision.repository.js";
import { buildRevision, ENTERED_PRO_PRICE_HEADER } from "../domain/revision.js";
import { CatalogRevisionSource } from "../domain/ports/catalog-revision.source.js";

/** Le préfixe des révisions — `P` aux produits, `C` aux sociétés, `R` ici. */
const REVISION_PREFIX = "R";

/** Ce qu'une capture rend : l'ancre posée, ou celle qui existait déjà. */
export type TakenRevision = CatalogRevisionTakenView;

export class TakeCatalogRevisionCommand {
  constructor(
    readonly label: string | null,
    /** Le POURQUOI, en clair. `null` = on n'en écrit pas. */
    readonly note: string | null = null,
  ) {}
}

/**
 * **Poser un point d'ancrage sur le catalogue.**
 *
 * Une photographie, pas une modification : rien du catalogue ne change, et
 * c'est ce qui permet de la poser aussi souvent qu'on veut.
 *
 * ## Une capture identique ne pose rien
 *
 * La garde demande « **cette ancre existe-t-elle ?** », par son empreinte — et
 * non « est-ce la dernière ? », qui poserait une seconde ancre A sur un
 * aller-retour A → B → A, un doublon que rien ne distingue de l'original.
 *
 * Un LIBELLÉ ne suffit pas à justifier une nouvelle ancre : nommer différemment
 * un catalogue identique ne le rend pas différent.
 *
 * ⚠️ **Cette garde ne gagne pas la course, et n'a pas à la gagner.** Deux
 * pushs simultanés lisent tous deux « rien », calculent la même empreinte et
 * écrivent tous deux : la lecture est hors transaction. C'est
 * `catalog_revision.hash` en `@unique` qui ferme la course — la base refuse,
 * et celui qui perd **rattrape l'ancre du gagnant** au lieu de tomber. Il
 * voulait cette ancre-là ; elle existe ; il l'a. La garde n'est qu'une
 * optimisation qui évite un aller-retour, pas une ligne de défense.
 *
 * ## Un push échoué ne laisse pas de déchet
 *
 * L'ancre est posée **avant** l'envoi — l'ordre est délibéré : elle dit ce qu'on
 * s'apprête à publier, pas ce qui est parti. Un échec en laisse donc une sans
 * publication ; au retry, l'empreinte la **retrouve** et la publication
 * réussie s'inscrit dessus.
 */
@CommandHandler(TakeCatalogRevisionCommand)
export class TakeCatalogRevisionHandler implements ICommandHandler<
  TakeCatalogRevisionCommand,
  TakenRevision
> {
  constructor(
    private readonly source: CatalogRevisionSource,
    private readonly revisions: CatalogRevisionRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly ids: UuidGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: TakeCatalogRevisionCommand): Promise<TakenRevision> {
    const items = await this.source.snapshotItems();
    const revision = buildRevision(ENTERED_PRO_PRICE_HEADER, items);

    // L'empreinte d'abord, la question ensuite : on ne peut pas demander « cette
    // ancre existe-t-elle ? » avant de savoir laquelle.
    const existing = await this.revisions.loadByHash(revision.hash);
    if (existing !== null) {
      return this.nameIfMute(existing, command);
    }
    const anchor = this.anchorFor(command, revision.hash);
    const posed = await this.pose(command, revision, anchor).catch((error: unknown) =>
      this.adoptWinner(error, revision.hash),
    );
    return {
      id: posed.id,
      reference: posed.reference,
      hash: revision.hash,
      label: command.label,
      created: !("adopted" in posed),
    };
  }

  /**
   * 🔴 **Une ancre muette prend le nom qu'on lui apporte.**
   *
   * Le cas est celui d'un push : l'ancre existe déjà — un envoi précédent l'a
   * posée, ou un « préparer » sans nom — et l'appelant arrive avec une
   * intention. La lui refuser laisserait une ancre anonyme partir une fois de
   * plus. Le PREMIER nom gagne : une ancre déjà nommée garde le sien, car il
   * dit avec quelle intention un catalogue est parti chez des clients.
   */
  private async nameIfMute(
    existing: CatalogRevision,
    command: TakeCatalogRevisionCommand,
  ): Promise<TakenRevision> {
    if (!existing.isNamed && command.label !== null) {
      existing.name(command.label, command.note);
      await this.revisions.save(existing);
      await this.journal.trace({
        type: PIM_EVENTS.catalogRevisionNamed,
        subjectType: "catalog_revision",
        subjectId: existing.id,
        payload: {
          subjectLabel: command.label,
          reference: existing.reference,
          label: command.label,
        },
      });
    }
    return {
      id: existing.id,
      reference: existing.reference,
      hash: existing.hash,
      label: existing.label,
      created: false,
    };
  }

  /**
   * L'ancre à poser. Sa référence est dérivée de l'identifiant, pas tirée d'un
   * compteur : lire « le dernier numéro » pour ajouter un serait une course,
   * et deux publications simultanées calculeraient le même.
   */
  private anchorFor(command: TakeCatalogRevisionCommand, hash: string): CatalogRevision {
    const id = this.ids.next();
    return CatalogRevision.take({
      id,
      reference: referenceFrom(REVISION_PREFIX, id),
      label: command.label,
      note: command.note,
      hash,
      takenAt: new Date(this.clock.now()),
      takenBy: currentRequestContext()?.actor.id ?? "system",
    });
  }

  /**
   * Course perdue : un autre push vient de poser exactement cette ancre. On la
   * rattrape plutôt que de rendre une erreur pour un résultat déjà là.
   */
  private async adoptWinner(
    error: unknown,
    hash: string,
  ): Promise<{ readonly id: string; readonly reference: string; readonly adopted: true }> {
    if (!(error instanceof RevisionHashAlreadyTakenError)) {
      throw error;
    }
    const winner = await this.revisions.loadByHash(hash);
    if (winner === null) {
      throw error;
    }
    return { id: winner.id, reference: winner.reference, adopted: true };
  }

  /**
   * La trace et l'ancre, dans la MÊME transaction : si la trace passait et
   * l'ancre non, l'historique affirmerait une révision que la base ne porte pas.
   */
  private async pose(
    command: TakeCatalogRevisionCommand,
    revision: ReturnType<typeof buildRevision>,
    anchor: CatalogRevision,
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
        // `subjectLabel` : le nom qu'on lui donne, sinon son EMPREINTE — la
        // référence lisible (`R-…`) n'existe qu'après l'écriture, et rien
        // d'autre ne nomme l'ancre à cet instant.
        payload: {
          subjectLabel: command.label ?? revision.hash,
          hash: revision.hash,
          label: command.label,
          note: command.note,
        },
        // La portée d'une ancre : combien d'articles elle fige.
        blast: { articles: revision.items.length },
      });
      await this.revisions.add(anchor, revision, ticket);
      return { id: anchor.id, reference: anchor.reference };
    });
  }
}
