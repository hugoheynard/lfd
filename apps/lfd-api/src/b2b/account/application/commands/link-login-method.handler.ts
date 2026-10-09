import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  LoginMethodAlreadyLinkedError,
  LoginMethodClaimedElsewhereError,
} from "../../domain/errors/account-errors.js";
import { LoginMethodLinkedEvent } from "../../domain/events/person-acts.event.js";
import {
  CustomerIdentityPort,
  type LoginMethod,
} from "../../domain/ports/customer-identity.port.js";
import { IdentityProofVerifier } from "../../domain/ports/identity-proof.verifier.js";
import { LoginSubjectReader } from "../../domain/ports/login-subject.reader.js";
import { LinkableIdentity } from "../../domain/value-objects/linkable-identity.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { LinkLoginMethodCommand } from "./link-login-method.command.js";

/**
 * Ajoute une méthode de connexion au compte : **on vérifie, on rattache, on
 * relit**.
 *
 * ## La preuve, et ce qu'elle prouve
 *
 * Rien n'est lu de l'adresse du compte tiers — ni comparée, ni recopiée. La
 * preuve est structurelle : pour ajouter une connexion à ce compte, il faut
 * déjà être dedans (jeton d'accès) **et** tenir la session de l'autre (jeton
 * d'identité). C'est ce qui rend impossible de s'approprier le compte de
 * quelqu'un en écrivant son adresse quelque part.
 *
 * 🔴 **Depuis le 2026-10-09, la preuve n'est vérifiée QUE chez nous.** Le
 * fournisseur recevait le jeton (`link_with`) et le revérifiait ; il le
 * refusait toujours, l'audience de la SPA n'étant pas son client de gestion.
 * On lui désigne désormais le sujet vérifié — et le client de gestion peut
 * absorber n'importe quel compte. D'où {@link LinkableIdentity} : seuls les
 * fournisseurs que l'écran propose passent, jamais `auth0|…` (un compte staff
 * vit dans le même tenant). Risque assumé : le vérificateur date l'émission
 * du jeton, pas l'authentification, et ne lit pas de `nonce` ; un rejeu exige
 * d'être déjà dans le compte principal.
 *
 * ## 🔴 Trois temps, et c'est une détection avec compensation — pas un verrou
 *
 * Le refus qui compte (« ce compte tiers ouvre déjà un AUTRE compte chez
 * nous ») se lit dans NOTRE base, le rattachement s'écrit chez un TIERS : rien
 * ne tient la fenêtre entre les deux, et son peupleur est automatique — la
 * résolution du principal crée une ligne à la première requête d'un `sub`
 * inconnu. D'où (plan `plan-rattachement-depuis-le-profil.md`, §9.4) :
 *
 * 1. **avant** — refus immédiat si le sujet prouvé ouvre déjà un autre compte.
 *    Ferme le cas courant, sans coût ;
 * 2. **le rattachement** chez le fournisseur ;
 * 3. **après** — on relit. Si une ligne est apparue entre les deux, on **défait**
 *    le rattachement et on refuse. Sans ce troisième temps, cette ligne
 *    deviendrait inatteignable — son sujet ne produirait plus jamais de jeton,
 *    puisque l'identité a été absorbée ici — et personne ne le saurait.
 *
 * La fenêtre existe toujours ; ce qui change, c'est qu'on ne la traverse plus
 * en silence.
 *
 * `@hors-transaction` la vérification et le rattachement se font chez un tiers,
 * et **rien ne s'écrit chez nous** : le fait part seul, après la réussite. Une
 * transaction n'annulerait pas le rattachement, elle ne ferait que tenir une
 * connexion ouverte le temps de deux allers-retours réseau.
 */
@CommandHandler(LinkLoginMethodCommand)
export class LinkLoginMethodHandler implements ICommandHandler<LinkLoginMethodCommand, void> {
  private readonly logger = new Logger(LinkLoginMethodHandler.name);

  constructor(
    private readonly proofs: IdentityProofVerifier,
    private readonly subjects: LoginSubjectReader,
    private readonly identity: CustomerIdentityPort,
    private readonly events: DomainEventPublisher,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: LinkLoginMethodCommand): Promise<void> {
    const proof = await this.proofs.verify(command.idToken);
    // On ne se relie pas à soi-même : la preuve désigne le compte courant, donc
    // la personne n'a rien ajouté. Le dire « déjà rattachée » est exact — et
    // c'est ce que l'écran affiche déjà.
    if (proof.subject === command.subject) {
      throw new LoginMethodAlreadyLinkedError();
    }
    const secondary = LinkableIdentity.of(proof.subject);
    await this.refuseIfClaimed(secondary.subject, command.userId);

    const methods = await this.identity.linkLoginMethod(command.subject, secondary);
    const linked = secondaryAmong(methods, secondary);
    await this.undoIfClaimedMeanwhile(command, secondary.subject, linked);

    await this.events.publishTraced(
      new LoginMethodLinkedEvent(
        command.userId,
        await this.names.person(command.userId),
        linked.provider,
        linked.connection,
      ),
    );
  }

  /** Le contrôle « avant » : il ferme le cas courant sans rien écrire nulle part. */
  private async refuseIfClaimed(provenSubject: string, userId: string): Promise<void> {
    const owner = await this.subjects.findUserIdBySubject(provenSubject);
    if (owner === null) {
      return;
    }
    throw owner === userId
      ? new LoginMethodAlreadyLinkedError()
      : new LoginMethodClaimedElsewhereError();
  }

  /**
   * Le contrôle « après » : une ligne est-elle apparue pendant le rattachement ?
   *
   * L'échec du détachement compensatoire est journalisé et n'éclipse pas le
   * refus : la personne doit lire pourquoi on n'a pas rattaché, et l'écart
   * chez le fournisseur est une affaire d'exploitation — pas une phrase de plus
   * à lui faire lire.
   */
  private async undoIfClaimedMeanwhile(
    command: LinkLoginMethodCommand,
    provenSubject: string,
    linked: LoginMethod,
  ): Promise<void> {
    const owner = await this.subjects.findUserIdBySubject(provenSubject);
    if (owner === null || owner === command.userId) {
      return;
    }
    try {
      await this.identity.unlinkLoginMethod(
        command.subject,
        linked.provider,
        linked.secondaryUserId,
      );
    } catch (cause) {
      this.logger.error(
        `Rattachement à défaire sur « ${linked.provider} » : le détachement a échoué, ` +
          `un compte est devenu inatteignable (compte ${command.userId}).`,
        cause,
      );
    }
    throw new LoginMethodClaimedElsewhereError();
  }
}

/**
 * La méthode que le rattachement vient d'ajouter, parmi celles que le
 * fournisseur rend.
 *
 * Le repli reprend l'identité déjà découpée : une réponse dont la forme
 * surprend ne doit pas empêcher d'écrire le fait ni de tenter la compensation.
 * Seul `provider` voyage au journal.
 */
function secondaryAmong(methods: readonly LoginMethod[], secondary: LinkableIdentity): LoginMethod {
  const found = methods.find(
    (method) =>
      method.provider === secondary.provider && method.secondaryUserId === secondary.userId,
  );
  return (
    found ?? {
      provider: secondary.provider,
      secondaryUserId: secondary.userId,
      connection: null,
      isPrimary: false,
    }
  );
}
