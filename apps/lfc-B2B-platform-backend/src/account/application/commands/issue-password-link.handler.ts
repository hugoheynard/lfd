import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import { PendingAccessReader } from "../../domain/ports/pending-access.reader.js";
import { PendingAccessNotFoundError } from "../../domain/errors/account-errors.js";
import { IssuePasswordLinkCommand } from "./issue-password-link.command.js";

/**
 * Fabrique un lien de mot de passe **à la demande**, pour que le staff le
 * remette de la main à la main.
 *
 * ⚠️ **On n'en retrouve pas un, on en fabrique un.** Un lien est à usage unique
 * et daté : conserver celui de l'ouverture pour le ressortir trois semaines
 * plus tard rendrait un lien mort, et le stocker ferait dormir en base de quoi
 * prendre un compte. Chaque remise en produit un neuf.
 *
 * ⚠️ **Le lien ne va nulle part ailleurs que dans la réponse.** Pas de journal,
 * pas de log : le journal d'activité est lu par plus de monde que celui qui a
 * demandé le lien, et un porteur de droits qui traîne dans une ligne de log est
 * un porteur de droits perdu.
 *
 * Le statut est revalidé par le reader (`subjectOf` ne rend que les `invited`) :
 * entre l'affichage de la file et le clic, la personne a pu poser son mot de
 * passe, et lui fabriquer un lien reviendrait alors à offrir de quoi le
 * réinitialiser sans qu'elle ait rien demandé.
 */
@CommandHandler(IssuePasswordLinkCommand)
export class IssuePasswordLinkHandler implements ICommandHandler<IssuePasswordLinkCommand, string> {
  constructor(
    private readonly pending: PendingAccessReader,
    private readonly identity: CustomerIdentityPort,
  ) {}

  async execute(command: IssuePasswordLinkCommand): Promise<string> {
    const subject = await this.pending.subjectOf(command.userId);
    if (subject === null) {
      throw new PendingAccessNotFoundError(command.userId);
    }
    return this.identity.issuePasswordLink(subject);
  }
}
