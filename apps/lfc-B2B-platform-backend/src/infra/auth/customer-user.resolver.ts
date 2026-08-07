import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserRegisteredEvent } from "../../account/domain/events/user-registered.event.js";
import { PrismaService } from "../database/prisma.service.js";
import { UserStatus } from "../database/client/client.js";
import type { CustomerRole } from "../database/client/client.js";
import { DomainEventPublisher } from "../events/domain-event-publisher.js";
import type { Principal, VerifiedToken } from "./principal.js";

/** La personne + ses rattachements, réduits à ce que la résolution lit. */
interface ResolvedUser {
  readonly id: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly memberships: { readonly companyId: string; readonly role: CustomerRole }[];
}

/**
 * Relie l'identité **externe** prouvée par Auth0 (le `sub`) à notre `User`
 * **local** — la seule source autoritaire d'autorisation.
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
 * Un compte **existant mais non `active`** (invité par le staff, désactivé) reste
 * refusé : le provisioning ne crée que l'absent, il ne réactive jamais.
 */
@Injectable()
export class CustomerUserResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Résout le `Principal` enrichi à partir d'un jeton vérifié. Provisionne le
   * self-signup absent (JIT).
   * @throws UnauthorizedException si le compte (existant) n'est pas actif.
   */
  async resolve(token: VerifiedToken): Promise<Principal> {
    const user = (await this.findBySub(token.subject)) ?? (await this.provision(token));

    if (user.status !== UserStatus.active) {
      throw new UnauthorizedException("Compte non actif.");
    }

    // `subject` vient du token ; `userId`/`email`/`memberships` de la BASE (autorité).
    return {
      subject: token.subject,
      userId: user.id,
      email: user.email,
      memberships: user.memberships,
      scopes: token.scopes,
    };
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
