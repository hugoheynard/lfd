import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { EntityLogo } from "../../domain/value-objects/entity-logo.js";
import { legalEntityLogoKey, loadOrFail } from "../legal-entity-support.js";
import { SetLegalEntityLogoCommand } from "./legal-entity-commands.js";

/**
 * Dépose (ou remplace) le logo de l'entité émettrice.
 *
 * ## L'ordre des trois gestes est le sujet
 *
 * **Valider, ranger, puis écrire la clé** — le même ordre que le dépôt d'un
 * KBIS, et pour les mêmes raisons : on ne range jamais un fichier douteux, et la
 * base ne pointe jamais vers un objet qui n'est pas arrivé. Inverser les deux
 * derniers ferait servir un mandat dont le logo n'existe pas, et le défaut ne se
 * verrait qu'à l'impression.
 *
 * L'entité est chargée **après** le dépôt au stockage, comme pour le KBIS : une
 * entité inconnue laisse alors un objet orphelin dans le bucket, ce qui ne coûte
 * rien et ne fuit rien, là où l'ordre inverse laisserait une clé en base sans
 * octets derrière.
 *
 * ## Aucun fait au journal, et c'est délibéré
 *
 * Les sept faits de ce contexte tracent ce qui **finit imprimé sur un document
 * opposable** ou décide **d'où l'argent arrive**. Un logo ne fait ni l'un ni
 * l'autre : il est décoratif, il ne conditionne pas `canCollect()`, et personne
 * ne demandera jamais « quel rond portait le mandat qu'il a signé ». Tracer ce
 * geste-là diluerait un journal dont toute la valeur tient à ce qu'il ne
 * contient que des faits qu'on vient interroger.
 */
@CommandHandler(SetLegalEntityLogoCommand)
export class SetLegalEntityLogoHandler implements ICommandHandler<SetLegalEntityLogoCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly store: DocumentStore,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetLegalEntityLogoCommand): Promise<void> {
    const logo = EntityLogo.create(command.fileName, command.bytes);

    const key = await this.store.save(legalEntityLogoKey(command.legalEntityId), {
      bytes: logo.bytes,
      contentType: logo.contentType,
    });

    const entity = await loadOrFail(this.entities, command.legalEntityId);
    entity.attachLogo(key);
    await this.uow.run(async () => {
      await this.entities.save(entity);
    });
  }
}
