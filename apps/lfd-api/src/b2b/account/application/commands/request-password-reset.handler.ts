import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { NoPasswordLoginMethodError } from "../../domain/errors/account-errors.js";
import { PasswordResetRequestedEvent } from "../../domain/events/person-acts.event.js";
import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { RequestPasswordResetCommand } from "./request-password-reset.command.js";

/**
 * **Envoie à la personne un lien pour changer son mot de passe** — son propre
 * compte, son propre geste (plan
 * `documentation/auth-inscription/plan-page-mon-profil.md`, §3).
 *
 * ## Ce qu'il ne réutilise pas, et pourquoi
 *
 * `IssuePasswordLinkHandler` fait le geste voisin côté staff, et il **rend**
 * `{ url, expiresAt }` : un commercial doit pouvoir remettre le lien en
 * personne. Ici, c'est exactement ce qu'il ne faut pas. Le ticket porte
 * `mark_email_as_verified` — le suivre PROUVE l'accès à la boîte —, donc le
 * rendre à l'écran marquerait prouvée une adresse que personne n'a ouverte. Le
 * port ne le rend pas (`sendPasswordResetLink`), et ce handler n'a donc jamais
 * l'occasion de le laisser fuir : la contrainte est structurelle, pas tenue par
 * la relecture.
 *
 * ## 🔴 Ce que ce handler ne protège PAS, et qui s'en charge
 *
 * Il ne demande **aucune preuve supplémentaire** : ni session fraîche, ni
 * adresse déjà prouvée. Un tiers devant un poste laissé ouvert peut donc
 * déclencher l'envoi — il ne recevra pas le lien, mais il aura fait partir un
 * message. La protection contre la prise de compte se décide **ailleurs**, au
 * **changement d'adresse**, qui est le vrai geste pivot : tant que l'adresse du
 * compte reste celle de la personne, le lien ne peut aller que chez elle.
 *
 * La règle « l'adresse doit être prouvée » écrite au plan a été **mise de côté
 * le 2026-09-22** : aucun compte de la base ne porte `email_verified = true`
 * (l'ouverture d'identité pose `verify_email: false`), et aucune route client
 * ne permet de demander un courriel de vérification — le refus aurait donc
 * refusé tout le monde en désignant une porte qui n'existe pas. À trancher avec
 * le geste de vérification d'adresse, pas ici.
 *
 * ## Le seul refus, et il est posé avant le premier appel sortant
 *
 * Un compte entré par Google n'a pas d'identité à mot de passe. Le fournisseur
 * refuserait d'émettre, et la chaîne rendrait un 500 à quelqu'un dont le compte
 * va bien. On lit donc les méthodes du compte d'abord, et on nomme le cas.
 *
 * ⚠️ C'est un appel réseau sortant de plus, assumé : il n'a lieu que sur ce
 * geste, qui est rare et déjà borné par le débit par compte.
 *
 * ## L'ordre : le fait, puis l'envoi
 *
 * Inverse de l'intuition, et c'est la règle d'`OpenStaffAccess` — « jamais un
 * e-mail envoyé derrière un 500 ». Le fait nomme la **demande**, qui a bien eu
 * lieu dès qu'on arrive ici ; l'écrire avant garantit qu'un journal en panne
 * échoue la requête **sans** qu'un message soit parti. Dans l'autre sens, un
 * lien serait déjà dans une boîte quand l'appelant lit son 500 — et il
 * réessaierait.
 *
 * `@hors-transaction` l'émission et l'envoi se font chez des tiers, et rien ne
 * s'écrit chez nous : le fait part seul. Une transaction ne les annulerait pas,
 * elle tiendrait une connexion ouverte le temps de deux allers-retours réseau.
 */
@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler implements ICommandHandler<
  RequestPasswordResetCommand,
  void
> {
  constructor(
    private readonly identity: CustomerIdentityPort,
    private readonly config: AppConfig,
    private readonly events: DomainEventPublisher,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<void> {
    await this.refuseWithoutPasswordLogin(command.subject);
    await this.events.publishTraced(
      new PasswordResetRequestedEvent(command.userId, await this.names.person(command.userId)),
    );
    await this.identity.sendPasswordResetLink(command.subject, command.email);
  }

  /**
   * La connexion **base de données** du fournisseur est celle qui porte un mot
   * de passe ; les autres (`google-oauth2`, `facebook`) n'en ont pas. On compare
   * donc au nom de connexion configuré, et non au `provider` : `auth0` est aussi
   * ce que porte une identité d'un AUTRE tenant, et se fier au fournisseur
   * seul ferait passer pour « à mot de passe » une connexion qui ne l'est pas.
   */
  private async refuseWithoutPasswordLogin(subject: string): Promise<void> {
    const methods = await this.identity.listLoginMethods(subject);
    const passwordConnection = this.config.auth0DatabaseConnection();
    if (!methods.some((method) => method.connection === passwordConnection)) {
      throw new NoPasswordLoginMethodError();
    }
  }
}
