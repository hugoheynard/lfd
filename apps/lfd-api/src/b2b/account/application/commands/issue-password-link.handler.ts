import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  expiryFrom,
  type IssuedPasswordLink,
} from "../../../../platform/identity/password-link.js";
import { PendingAccessReader } from "../../domain/ports/pending-access.reader.js";
import { PendingAccessNotFoundError } from "../../domain/errors/account-errors.js";
import { IssuePasswordLinkCommand } from "./issue-password-link.command.js";

/**
 * Le lien, et **jusqu'à quand il ouvre**.
 *
 * L'échéance part avec lui : un commercial qui copie un lien le mardi et
 * l'envoie le lundi suivant enverrait une erreur, et il doit le savoir au
 * moment de coller, pas au moment où le client se plaint.
 */
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
export class IssuePasswordLinkHandler implements ICommandHandler<
  IssuePasswordLinkCommand,
  IssuedPasswordLink
> {
  constructor(
    private readonly pending: PendingAccessReader,
    private readonly identity: CustomerIdentityPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: IssuePasswordLinkCommand): Promise<IssuedPasswordLink> {
    const subject = await this.pending.subjectOf(command.userId);
    if (subject === null) {
      throw new PendingAccessNotFoundError(command.userId);
    }
    const url = await this.identity.issuePasswordLink(subject);
    // Calculée ici et non devinée par l'écran : c'est le serveur qui demande le
    // TTL au fournisseur, lui seul sait combien de temps le ticket ouvre.
    return { url, expiresAt: expiryFrom(this.clock.now()) };
  }
}
