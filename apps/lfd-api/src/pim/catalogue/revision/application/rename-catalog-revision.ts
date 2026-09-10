import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import {
  RevisionAlreadyNamedError,
  RevisionNotFoundError,
} from "../domain/errors/revision-errors.js";
import { CatalogRevisionRepository } from "../domain/ports/catalog-revision.repository.js";

export class RenameCatalogRevisionCommand {
  constructor(
    readonly reference: string,
    readonly label: string,
    /** Le POURQUOI. `null` = on ne fait que nommer. */
    readonly note: string | null = null,
  ) {}
}

/**
 * **Nommer une ancre qui ne l'était pas.**
 *
 * ## Pourquoi ce geste existe
 *
 * Le push posait une ancre ANONYME à chaque envoi — personne n'était jamais
 * interrogé. Les ancres muettes d'avant la règle sont donc nombreuses, et
 * certaines sont parties chez des clients. Leur inventer un nom (« Publication
 * du 5 septembre ») serait pire que le silence : une intention fabriquée ment
 * mieux qu'une absence, et rien ne distinguerait ensuite ce qu'on a décidé de
 * ce qu'un script a rempli.
 *
 * D'où ce geste, et lui seul : **on répare à la main, quand on se souvient**.
 *
 * ## Nommer, pas renommer
 *
 * Une ancre déjà nommée est refusée. Le nom dit l'intention avec laquelle un
 * catalogue est parti ; le réécrire ne corrige pas le passé, il le raconte
 * autrement — et l'écran qui relit une publication d'il y a trois mois lirait
 * alors une intention que personne n'avait ce jour-là.
 *
 * ⚠️ C'est une écriture nue sur une ligne, sans agrégat, et c'est assumé : une
 * révision n'a ni transition ni invariant — c'est une photographie immuable
 * dont le seul champ mobile est son nom, et ce nom ne peut rien refuser que la
 * garde ci-dessus. Lui bâtir un agrégat serait la cérémonie que le §3.1 de
 * `CLAUDE.md` déconseille.
 *
 * @throws {RevisionNotFoundError} la référence ne désigne aucune ancre.
 * @throws {RevisionAlreadyNamedError} elle porte déjà un nom.
 */
@CommandHandler(RenameCatalogRevisionCommand)
export class RenameCatalogRevisionHandler implements ICommandHandler<
  RenameCatalogRevisionCommand,
  void
> {
  constructor(
    private readonly revisions: CatalogRevisionRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RenameCatalogRevisionCommand): Promise<void> {
    const revision = await this.revisions.byReference(command.reference);
    if (revision === null) {
      throw new RevisionNotFoundError(command.reference);
    }
    if (revision.label !== null) {
      throw new RevisionAlreadyNamedError(revision.reference, revision.label);
    }
    // La trace et le nom dans la MÊME transaction. Un nom écrit sans trace ne se
    // voit nulle part : l'écran l'affiche, et le jour où quelqu'un demande qui
    // l'a posé, le blanc ne se comble plus.
    await this.uow.run(async () => {
      await this.journal.trace({
        type: PIM_EVENTS.catalogRevisionNamed,
        subjectType: "catalog_revision",
        subjectId: revision.id,
        // Le nom EST le fait : sans lui, la trace dirait qu'on a nommé une
        // ancre sans dire comment, et il faudrait relire la ligne pour le
        // savoir — donc lire l'état d'aujourd'hui pour comprendre un geste
        // d'hier.
        payload: { reference: revision.reference, label: command.label, note: command.note },
      });
      await this.revisions.rename(revision.id, command.label, command.note);
    });
  }
}
