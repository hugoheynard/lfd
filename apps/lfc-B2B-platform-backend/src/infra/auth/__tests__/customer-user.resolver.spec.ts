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

/** Double Prisma : `findUnique` renvoie la séquence donnée (dernière valeur figée),
 *  `create` capture ses `data` et peut échouer (course d'unicité). */
interface PrismaDouble {
  readonly createCalls: { auth0Sub: string; email: string; status: UserStatus }[];
  readonly prisma: {
    user: {
      findUnique: () => Promise<UserWithMemberships | null>;
      create: (args: {
        data: { auth0Sub: string; email: string; status: UserStatus };
      }) => Promise<unknown>;
    };
  };
}

function prismaDouble(
  results: (UserWithMemberships | null)[],
  options: { createError?: Error } = {},
): PrismaDouble {
  let index = 0;
  const createCalls: PrismaDouble["createCalls"] = [];
  return {
    createCalls,
    prisma: {
      user: {
        findUnique: () => Promise.resolve(results[Math.min(index++, results.length - 1)] ?? null),
        create: ({ data }) => {
          createCalls.push(data);
          return options.createError === undefined
            ? Promise.resolve({})
            : Promise.reject(options.createError);
        },
      },
    },
  };
}

async function resolverWith(double: PrismaDouble): Promise<CustomerUserResolver> {
  const moduleRef = await Test.createTestingModule({
    providers: [CustomerUserResolver, { provide: PrismaService, useValue: double.prisma }],
  }).compile();
  return moduleRef.get(CustomerUserResolver);
}

describe("CustomerUserResolver", () => {
  describe("compte existant", () => {
    it("résout un Principal autoritaire depuis la base pour un compte actif", async () => {
      const resolver = await resolverWith(prismaDouble([activeUser]));
      // userId / email / memberships viennent de la BASE ; subject + scopes du token.
      await expect(resolver.resolve(token)).resolves.toEqual({
        subject: "auth0|123",
        userId: "user_1",
        email: "jean@client.fr",
        memberships: [{ companyId: "company_1", role: CustomerRole.member }],
        scopes: ["read:orders"],
      });
    });

    it("rejette un compte non actif (invited / disabled) sans le réactiver", async () => {
      const double = prismaDouble([{ ...activeUser, status: UserStatus.invited }]);
      const resolver = await resolverWith(double);
      await expect(resolver.resolve(token)).rejects.toThrow("Compte non actif.");
      expect(double.createCalls).toHaveLength(0);
    });

    it("authentifie une personne sans aucune société (compte tout juste créé)", async () => {
      const resolver = await resolverWith(prismaDouble([{ ...activeUser, memberships: [] }]));
      await expect(resolver.resolve(token)).resolves.toMatchObject({
        userId: "user_1",
        memberships: [],
      });
    });

    it("porte le rôle propre à chaque société pour une personne multi-sociétés", async () => {
      const resolver = await resolverWith(
        prismaDouble([
          {
            ...activeUser,
            memberships: [
              { companyId: "company_1", role: CustomerRole.company_admin },
              { companyId: "company_2", role: CustomerRole.member },
            ],
          },
        ]),
      );
      await expect(resolver.resolve(token)).resolves.toMatchObject({
        memberships: [
          { companyId: "company_1", role: CustomerRole.company_admin },
          { companyId: "company_2", role: CustomerRole.member },
        ],
      });
    });
  });

  describe("provisioning JIT (self-signup)", () => {
    it("crée un compte ACTIF pour un sub inconnu et capture l'e-mail du token", async () => {
      const provisioned: UserWithMemberships = {
        ...activeUser,
        id: "user_new",
        auth0Sub: "auth0|new",
        email: "new@client.fr",
        memberships: [],
      };
      // 1er lookup: absent → provision ; 2e lookup: la personne créée.
      const double = prismaDouble([null, provisioned]);
      const resolver = await resolverWith(double);

      const principal = await resolver.resolve({
        subject: "auth0|new",
        scopes: [],
        email: "new@client.fr",
      });

      expect(double.createCalls).toEqual([
        { auth0Sub: "auth0|new", email: "new@client.fr", status: UserStatus.active },
      ]);
      expect(principal).toMatchObject({
        subject: "auth0|new",
        userId: "user_new",
        email: "new@client.fr",
        memberships: [],
      });
    });

    it("provisionne avec un e-mail vide quand le token n'en porte pas", async () => {
      const provisioned: UserWithMemberships = {
        ...activeUser,
        id: "user_new",
        auth0Sub: "auth0|new",
        email: "",
        memberships: [],
      };
      const double = prismaDouble([null, provisioned]);
      const resolver = await resolverWith(double);

      await resolver.resolve({ subject: "auth0|new", scopes: [] });

      expect(double.createCalls).toEqual([
        { auth0Sub: "auth0|new", email: "", status: UserStatus.active },
      ]);
    });

    it("est idempotent : une course (create en conflit d'unicité) retombe sur le re-lookup", async () => {
      const provisioned: UserWithMemberships = {
        ...activeUser,
        id: "user_race",
        auth0Sub: "auth0|race",
        memberships: [],
      };
      // create échoue (P2002 : l'autre requête a gagné) ; le re-lookup trouve la ligne.
      const double = prismaDouble([null, provisioned], {
        createError: Object.assign(new Error("duplicate"), { code: "P2002" }),
      });
      const resolver = await resolverWith(double);

      await expect(resolver.resolve({ subject: "auth0|race", scopes: [] })).resolves.toMatchObject({
        userId: "user_race",
      });
    });

    it("relaie une erreur de création non liée à l'unicité (pas un swallow silencieux)", async () => {
      const double = prismaDouble([null, null], {
        createError: Object.assign(new Error("db down"), { code: "P1001" }),
      });
      const resolver = await resolverWith(double);

      await expect(resolver.resolve({ subject: "auth0|boom", scopes: [] })).rejects.toThrow(
        "db down",
      );
    });
  });
});
