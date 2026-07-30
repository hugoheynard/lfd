import { UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CustomerUserResolver } from "../customer-user.resolver.js";
import { PrismaService } from "../../database/prisma.service.js";
import { CustomerRole, UserStatus, type User } from "../../database/client/client.js";
import type { VerifiedToken } from "../principal.js";

const token: VerifiedToken = {
  subject: "auth0|123",
  scopes: ["read:orders"],
};

/** Ce que le resolver lit : la personne et ses rattachements. */
type UserWithMemberships = User & {
  memberships: { companyId: string; role: CustomerRole }[];
};

/** Une personne active, rattachée à une société. */
const activeUser: UserWithMemberships = {
  id: "user_1",
  auth0Sub: "auth0|123",
  email: "jean@client.fr",
  firstName: "Jean",
  lastName: "Client",
  phone: "01 02 03 04 05",
  status: UserStatus.active,
  invitedBy: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  memberships: [{ companyId: "company_1", role: CustomerRole.member }],
};

/** Resolver dont la base renvoie `user` (ou `null`) pour n'importe quel lookup. */
async function resolverReturning(user: UserWithMemberships | null): Promise<CustomerUserResolver> {
  const prismaStub = {
    user: { findUnique: (): Promise<UserWithMemberships | null> => Promise.resolve(user) },
  };
  const moduleRef = await Test.createTestingModule({
    providers: [CustomerUserResolver, { provide: PrismaService, useValue: prismaStub }],
  }).compile();
  return moduleRef.get(CustomerUserResolver);
}

describe("CustomerUserResolver", () => {
  it("rejette un sub sans User en base (compte inconnu)", async () => {
    const resolver = await resolverReturning(null);
    await expect(resolver.resolve(token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(resolver.resolve(token)).rejects.toThrow("Compte inconnu.");
  });

  it("rejette un compte non actif (invited / disabled)", async () => {
    const resolver = await resolverReturning({
      ...activeUser,
      status: UserStatus.invited,
    });
    await expect(resolver.resolve(token)).rejects.toThrow("Compte non actif.");
  });

  it("résout un Principal autoritaire depuis la base pour un compte actif", async () => {
    const resolver = await resolverReturning(activeUser);
    // userId / email / memberships viennent de la BASE (pas du token) ;
    // seuls subject + scopes viennent du token.
    await expect(resolver.resolve(token)).resolves.toEqual({
      subject: "auth0|123",
      userId: "user_1",
      email: "jean@client.fr",
      memberships: [{ companyId: "company_1", role: CustomerRole.member }],
      scopes: ["read:orders"],
    });
  });

  it("authentifie une personne sans aucune société (compte tout juste créé)", async () => {
    // Le cas qui n'existait pas avant : `company_id` était NOT NULL, donc « aucune
    // société » était irreprésentable. C'est désormais l'état de départ normal —
    // il doit passer l'authentification, sinon l'empty state « Mes entreprises »
    // serait inatteignable.
    const resolver = await resolverReturning({ ...activeUser, memberships: [] });

    await expect(resolver.resolve(token)).resolves.toMatchObject({
      userId: "user_1",
      memberships: [],
    });
  });

  it("porte le rôle propre à chaque société pour une personne multi-sociétés", async () => {
    const resolver = await resolverReturning({
      ...activeUser,
      memberships: [
        { companyId: "company_1", role: CustomerRole.company_admin },
        { companyId: "company_2", role: CustomerRole.member },
      ],
    });

    // Gestionnaire ici, simple membre là : c'est bien le rattachement qui porte le
    // rôle, et non la personne.
    await expect(resolver.resolve(token)).resolves.toMatchObject({
      memberships: [
        { companyId: "company_1", role: CustomerRole.company_admin },
        { companyId: "company_2", role: CustomerRole.member },
      ],
    });
  });
});
