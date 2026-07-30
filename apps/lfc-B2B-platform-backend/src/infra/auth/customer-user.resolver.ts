import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { UserStatus } from "../database/client/client.js";
import type { Principal, VerifiedToken } from "./principal.js";

/**
 * Relie l'identité **externe** prouvée par Auth0 (le `sub`) à notre `User`
 * **local** — la seule source autoritaire d'autorisation.
 *
 * Le token prouve seulement « ce porteur est ce `sub` ». Qui est ce client chez
 * nous, à quelle société il appartient (le mur de tenancy) et quel rôle il
 * détient : c'est notre base qui décide, jamais les claims. Un `sub` valide dont
 * on ne connaît pas le `User`, ou dont le compte n'est pas `active`, n'accède à
 * rien.
 */
@Injectable()
export class CustomerUserResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Résout le `Principal` enrichi à partir d'un jeton vérifié.
   * @throws UnauthorizedException si aucun `User` ne correspond au `sub`, ou si
   *   son compte n'est pas actif.
   */
  async resolve(token: VerifiedToken): Promise<Principal> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Sub: token.subject },
      // Les rattachements font partie de l'identité autorisée : on les charge
      // AVEC la personne, plutôt que dans une seconde requête que chaque
      // appelant pourrait oublier.
      include: { memberships: { select: { companyId: true, role: true } } },
    });

    if (user === null) {
      throw new UnauthorizedException("Compte inconnu.");
    }
    if (user.status !== UserStatus.active) {
      throw new UnauthorizedException("Compte non actif.");
    }

    // Une personne sans aucune société est parfaitement légitime : elle vient de
    // créer son compte et n'a pas encore déclaré d'entreprise. Elle accède à son
    // profil et à « Mes entreprises » — ce sont les endpoints MURÉS qui exigeront
    // une société, pas l'authentification.
    return {
      subject: token.subject,
      userId: user.id,
      email: user.email,
      memberships: user.memberships,
      scopes: token.scopes,
    };
  }
}
