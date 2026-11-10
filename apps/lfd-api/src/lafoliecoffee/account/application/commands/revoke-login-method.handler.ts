import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdentityUnlinkRefusedError } from "../../../../platform/shared/errors/identity-errors.js";
import { LoginMethodRevokedEvent } from "../../domain/events/person-acts.event.js";
import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { RevokeLoginMethodCommand } from "./revoke-login-method.command.js";

/**
 * Détache une méthode de connexion **secondaire**.
 *
 * 🔴 **L'identifiant secondaire se retrouve ici, il n'arrive pas par l'URL.**
 * C'est la raison d'être de la forme `DELETE /me/identities/:provider` : un
 * identifiant chez un tiers dans un chemin s'écrit dans tous les journaux
 * d'accès, et c'est exactement la panne du 2026-09-18 sous une autre forme
 * (plan `plan-rattachement-depuis-le-profil.md`, §9.5). Le nom de connexion,
 * lui, est déjà public — il voyage dans chaque URL d'autorisation.
 *
 * ⚠️ **Aucun refus « dernière méthode ».** La Management API ne délie que des
 * identités secondaires : la principale reste toujours, donc un tel refus ne
 * pourrait jamais partir, et un refus qui ne part jamais fait croire à une
 * protection (§9.6). La personne dont la seule méthode est sociale n'a rien à
 * retirer — l'écran ne lui propose aucun geste.
 *
 * `@hors-transaction` le détachement se fait chez le fournisseur et **rien ne
 * s'écrit chez nous** : le fait part seul, après sa réussite. Un journal en
 * panne échoue la requête, mais la méthode est bel et bien détachée — le même
 * écart que toute propagation à un tiers, et il se voit à l'erreur.
 */
@CommandHandler(RevokeLoginMethodCommand)
export class RevokeLoginMethodHandler implements ICommandHandler<RevokeLoginMethodCommand, void> {
  constructor(
    private readonly identity: CustomerIdentityPort,
    private readonly events: DomainEventPublisher,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: RevokeLoginMethodCommand): Promise<void> {
    const methods = await this.identity.listLoginMethods(command.subject);
    const target = methods.find(
      (method) => method.provider === command.provider && !method.isPrimary,
    );
    // Vue périmée (deux onglets, un retour arrière) ou méthode principale : le
    // même message dans les deux cas, parce que le geste de sortie est le même
    // — recharger et regarder ce qui est réellement rattaché.
    if (target === undefined) {
      throw new IdentityUnlinkRefusedError();
    }

    await this.identity.unlinkLoginMethod(command.subject, target.provider, target.secondaryUserId);
    await this.events.publishTraced(
      new LoginMethodRevokedEvent(
        command.userId,
        await this.names.person(command.userId),
        target.provider,
        target.connection,
      ),
    );
  }
}
