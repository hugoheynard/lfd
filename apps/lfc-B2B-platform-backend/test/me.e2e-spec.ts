import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module.js";
import { AccessTokenVerifier } from "../src/infra/auth/access-token.verifier.js";
import { PrismaService } from "../src/infra/database/prisma.service.js";
import { CustomerRole, UserStatus, type User } from "../src/infra/database/client/client.js";
import type { VerifiedToken } from "../src/infra/auth/principal.js";

/**
 * E2E du **cycle d'accès vu du backend** (register → login → logout), via
 * `GET /me`. register/login/logout au sens UI appartiennent à Auth0 ; côté
 * back, ce sont des états du `User` en base — et c'est ce que ce test exerce,
 * app NestJS complète bootée (guard global + resolver + endpoint).
 *
 * On stubbe seulement les frontières externes : la signature Auth0 (verifier)
 * et la base (Prisma renvoie `currentUser`, muté par chaque étape). Le cycle se
 * joue par le **statut en base**, pas par le token — c'est tout l'intérêt du
 * design **DB-autoritaire** : révoquer en base = blocage immédiat même avec un
 * jeton encore valide.
 */
const SUB = "auth0|lifecycle";

/** Ce que la base "renvoie" — muté à chaque étape du cycle. */
let currentUser: User | null = null;

function userWith(status: User["status"]): User {
  return {
    id: "user_test",
    auth0Sub: SUB,
    email: "test@client.fr",
    role: CustomerRole.member,
    status,
    companyId: "company_test",
    invitedBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const verifierStub = {
  verify: (): Promise<VerifiedToken> => Promise.resolve({ subject: SUB, scopes: [] }),
};

const prismaStub = {
  $connect: (): Promise<void> => Promise.resolve(),
  $disconnect: (): Promise<void> => Promise.resolve(),
  user: {
    findUnique: (): Promise<User | null> => Promise.resolve(currentUser),
  },
};

describe("Auth lifecycle (e2e) — GET /me", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AccessTokenVerifier)
      .useValue(verifierStub)
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Appel authentifié : le token est valide (stub), le cycle se joue en base. */
  function callMe() {
    return request(app.getHttpServer()).get("/me").set("Authorization", "Bearer valid-token");
  }

  it("sans jeton → 401", async () => {
    await request(app.getHttpServer()).get("/me").expect(401);
  });

  it("register / invited : compte pas encore actif → 401", async () => {
    currentUser = userWith(UserStatus.invited);
    await callMe().expect(401);
  });

  it("login : compte actif → 200 + Principal autoritaire (depuis la base)", async () => {
    currentUser = userWith(UserStatus.active);
    const res = await callMe().expect(200);
    expect(res.body).toEqual({
      subject: SUB,
      userId: "user_test",
      companyId: "company_test",
      role: CustomerRole.member,
      email: "test@client.fr",
      scopes: [],
    });
  });

  it("logout / révocation : status disabled → MÊME jeton refusé (401)", async () => {
    currentUser = userWith(UserStatus.disabled);
    await callMe().expect(401);
  });

  it("compte supprimé (inconnu en base) → 401", async () => {
    currentUser = null;
    await callMe().expect(401);
  });
});
