import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserRegisteredEvent } from "../domain/events/user-registered.event.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UserStatus } from "../../../platform/database/client/client.js";
import type { CustomerRole } from "../../../platform/database/client/client.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { PrincipalResolver } from "../../../platform/auth/principal.resolver.js";
import type { Principal, VerifiedToken } from "../../../platform/auth/principal.js";

/** La personne + ses rattachements, réduits à ce que la résolution lit. */
interface ResolvedUser {
  readonly id: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly emailVerified: boolean;
  readonly memberships: { readonly companyId: string; readonly role: CustomerRole }[];
}

/** Ce qu'une connexion **prouve**, et qu'il faut donc recopier en base. */
interface ProvenFacts {
  status?: UserStatus;
  emailVerified?: boolean;
}

/**
 * Relie l'identité **externe** prouvée par Auth0 (le `sub`) à notre `User`
 * **local** — la seule source autoritaire d'autorisation.
 *
 * Il vit dans `account/` et non dans `infra/auth/`, où il a longtemps été : il
 * lit la table des personnes, provisionne un client au vol et publie un
 * événement de ce domaine. Ce n'était donc pas de la technique, c'était
 * `account/` logé dans la couche technique — et cela faisait dépendre
 * l'authentification de CHAQUE requête de la plateforme marchande. La couche
 * technique n'en garde que le port ({@link PrincipalResolver}).
 *
 * Le token prouve seulement « ce porteur est ce `sub` ». Qui est ce client chez
 * nous, à quelle société il appartient (le mur de tenancy) et quel rôle il
 * détient : c'est notre base qui décide, jamais les claims.
 *
 * **Provisioning JIT (zéro friction).** La 1re requête authentifiée d'un `sub`
 * **inconnu** — un self-signup de la connexion `lfc-b2b-customers` — crée la
 * personne **automatiquement** (compte `active`, sans société) : sinon un client
 * fraîchement inscrit ne pourrait ni voir `/me` ni commander. Le mur d'accès reste
 * la **connexion Auth0** (seuls ces clients obtiennent un token) et la tenancy
 * `company_id` sur ce qui est muré ; ce n'est pas l'existence d'une ligne locale.
 * **Première connexion d'un invité.** Un compte `invited` a été provisionné par
 * le staff et n'a reçu qu'un lien de création de mot de passe ; présenter un
 * token prouve qu'il l'a suivi. On le passe donc `active` à cette occasion —
 * sinon le client à qui le commercial vient d'ouvrir un accès resterait dehors
 * pour toujours. `disabled` reste refusé : c'est une décision, pas une attente.
 */
@Injectable()
export class CustomerPrincipalResolver extends PrincipalResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {
    super();
  }

  /**
   * Résout le `Principal` enrichi à partir d'un jeton vérifié. Provisionne le
   * self-signup absent (JIT), active l'invité qui se connecte pour la 1re fois.
   * @throws UnauthorizedException si le compte est désactivé.
   */
  async resolve(token: VerifiedToken): Promise<Principal> {
    const user = (await this.findBySub(token.subject)) ?? (await this.provision(token));

    if (user.status === UserStatus.disabled) {
      throw new UnauthorizedException("Compte non actif.");
    }
    await this.record(user, token);

    // `subject` vient du token ; `userId`/`email`/`memberships` de la BASE (autorité).
    return {
      subject: token.subject,
      userId: user.id,
      email: user.email,
      memberships: user.memberships,
      scopes: token.scopes,
    };
  }

  /**
   * Recopie ce que **cette connexion** vient de prouver : l'invité devient
   * actif, et l'adresse devient vérifiée si le token le dit.
   *
   * Écrit seulement si quelque chose change — une requête d'écriture par appel
   * authentifié serait un coût permanent pour un fait qui ne bouge qu'une fois.
   * Un claim absent ne fait **rien** : « on ne sait pas » n'efface pas une
   * vérification déjà acquise.
   */
  private async record(user: ResolvedUser, token: VerifiedToken): Promise<void> {
    const facts: ProvenFacts = {};
    if (user.status === UserStatus.invited) {
      facts.status = UserStatus.active;
    }
    if (token.emailVerified === true && !user.emailVerified) {
      facts.emailVerified = true;
    }
    if (Object.keys(facts).length === 0) {
      return;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: facts });
  }

  /** La personne d'`auth0Sub`, rattachements inclus, ou `null`. */
  private findBySub(subject: string): Promise<ResolvedUser | null> {
    return this.prisma.user.findUnique({
      where: { auth0Sub: subject },
      // Les rattachements font partie de l'identité autorisée : on les charge AVEC
      // la personne, plutôt que dans une seconde requête que chacun pourrait oublier.
      include: { memberships: { select: { companyId: true, role: true } } },
    });
  }

  /**
   * Crée le self-signup absent en compte `active` (e-mail = claim du token s'il est
   * présent, sinon vide → renseigné plus tard via le profil). **Idempotent** : une
   * course (deux 1res requêtes simultanées) fait échouer le `create` sur l'unicité
   * d'`auth0Sub` ; on retombe alors sur le re-lookup.
   */
  private async provision(token: VerifiedToken): Promise<ResolvedUser> {
    let createdHere = false;
    try {
      await this.prisma.user.create({
        data: {
          auth0Sub: token.subject,
          email: token.email ?? "",
          status: UserStatus.active,
        },
      });
      createdHere = true;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
    const user = await this.findBySub(token.subject);
    if (user === null) {
      // Ne peut arriver que si la ligne disparaît entre la création et la relecture.
      throw new UnauthorizedException("Compte inconnu.");
    }
    // Fait de domaine, seulement si **cet** appel a créé la personne (pas la course
    // d'unicité, où l'autre requête l'a déjà émis) : signal « lead mid » (inscrit).
    if (createdHere) {
      this.events.publish(new UserRegisteredEvent(user.id, user.email));
    }
    return user;
  }
}

/** Violation d'unicité Prisma (`P2002`) — duck-typée, sans importer le client. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}
