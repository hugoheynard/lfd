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

/** Un customer actif de référence. */
const activeUser: User = {
  id: "user_1",
  auth0Sub: "auth0|123",
  email: "jean@client.fr",
  role: CustomerRole.member,
  status: UserStatus.active,
  companyId: "company_1",
  invitedBy: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

/** Resolver dont la base renvoie `user` (ou `null`) pour n'importe quel lookup. */
async function resolverReturning(user: User | null): Promise<CustomerUserResolver> {
  const prismaStub = {
    user: { findUnique: (): Promise<User | null> => Promise.resolve(user) },
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
    // userId / companyId / role / email viennent de la BASE (pas du token) ;
    // seuls subject + scopes viennent du token.
    await expect(resolver.resolve(token)).resolves.toEqual({
      subject: "auth0|123",
      userId: "user_1",
      companyId: "company_1",
      role: CustomerRole.member,
      email: "jean@client.fr",
      scopes: ["read:orders"],
    });
  });
});
