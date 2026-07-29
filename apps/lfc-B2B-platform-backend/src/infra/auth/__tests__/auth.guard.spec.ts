import { Controller, Get, type INestApplication } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AccessTokenVerifier } from "../access-token.verifier.js";
import { AuthGuard } from "../auth.guard.js";
import { CustomerUserResolver } from "../customer-user.resolver.js";
import { CurrentUser } from "../current-user.decorator.js";
import { CustomerRole } from "../../database/client/client.js";
import type { Principal, VerifiedToken } from "../principal.js";
import { Public } from "../public.decorator.js";

/** Principal enrichi renvoyé pour l'utilisateur actif. */
const principal: Principal = {
  subject: "auth0|active",
  userId: "user_1",
  companyId: "company_1",
  role: CustomerRole.member,
  email: "jean@client.fr",
  scopes: ["read:orders"],
};

/** Contrôleur sonde : une route ouverte, une route protégée. */
@Controller()
class ProbeController {
  @Public()
  @Get("open")
  open(): string {
    return "ok";
  }

  @Get("protected")
  protectedRoute(@CurrentUser() user: Principal): Principal {
    return user;
  }
}

/**
 * Verifier factice : tout jeton commençant par `bad` est refusé (signature) ;
 * sinon le `sub` retourné EST la valeur du jeton — le resolver décide ensuite.
 */
const verifierStub = {
  verify: (jeton: string): Promise<VerifiedToken> =>
    jeton.startsWith("bad")
      ? Promise.reject(new Error("signature refusée"))
      : Promise.resolve({ subject: jeton, scopes: ["read:orders"] }),
};

/**
 * Resolver factice : seul le sub `auth0|active` a un compte actif ; tout autre
 * est refusé comme en base (compte inconnu / inactif).
 */
const resolverStub = {
  resolve: (token: VerifiedToken): Promise<Principal> =>
    token.subject === "auth0|active"
      ? Promise.resolve(principal)
      : Promise.reject(new UnauthorizedException("Compte inconnu.")),
};

describe("AuthGuard (intégration)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: AccessTokenVerifier, useValue: verifierStub },
        { provide: CustomerUserResolver, useValue: resolverStub },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("laisse passer une route @Public() sans jeton", async () => {
    await request(app.getHttpServer()).get("/open").expect(200).expect("ok");
  });

  it("refuse une route protégée sans en-tête Authorization", async () => {
    await request(app.getHttpServer()).get("/protected").expect(401);
  });

  it("refuse un schéma qui n’est pas Bearer", async () => {
    await request(app.getHttpServer())
      .get("/protected")
      .set("Authorization", "Basic abc")
      .expect(401);
  });

  it("refuse un Bearer sans valeur", async () => {
    await request(app.getHttpServer()).get("/protected").set("Authorization", "Bearer").expect(401);
  });

  it("refuse un jeton dont la signature est invalide", async () => {
    await request(app.getHttpServer())
      .get("/protected")
      .set("Authorization", "Bearer bad-token")
      .expect(401);
  });

  it("refuse un jeton valide mais sans compte actif (refus du resolver)", async () => {
    // Signature ok (ne commence pas par `bad`), mais le sub n'a pas de compte.
    await request(app.getHttpServer())
      .get("/protected")
      .set("Authorization", "Bearer auth0|unknown")
      .expect(401);
  });

  it("accepte un jeton valide + compte actif et expose le Principal enrichi", async () => {
    const response = await request(app.getHttpServer())
      .get("/protected")
      .set("Authorization", "Bearer auth0|active")
      .expect(200);

    expect(response.body).toEqual(principal);
  });
});
