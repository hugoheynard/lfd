import { Controller, Get, Post, type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";

import { AccessTokenVerifier } from "../../../../platform/auth/access-token.verifier.js";
import { AuthGuard } from "../../../../platform/auth/auth.guard.js";
import { DevImpersonation } from "../../../../platform/auth/dev-impersonation.js";
import type { Principal, VerifiedToken } from "../../../../platform/auth/principal.js";
import { PrincipalResolver } from "../../../../platform/auth/principal.resolver.js";
import { Public } from "../../../../platform/auth/public.decorator.js";
import { AppErrorFilter } from "../../../../platform/shared/http/app-error.filter.js";
import { FeatureLevelResolver } from "../../application/feature-level.resolver.js";
import { FeatureLevelLookup } from "../../domain/ports/feature-level.lookup.js";
import { FeatureAccessGuard } from "../feature-access.guard.js";
import { RequiresShop } from "../requires-shop.decorator.js";

const TESTER_EMAIL = "testeur@exemple.fr";

/** Trois personnes : un client ordinaire, un testeur prouvé, son homonyme non prouvé. */
const PRINCIPALS: Readonly<Record<string, Principal>> = {
  client: principal("client", "client@exemple.fr", true),
  proven: principal("proven", "Testeur@Exemple.fr", true),
  unproven: principal("unproven", TESTER_EMAIL, false),
};

function principal(sub: string, email: string, emailProven: boolean): Principal {
  return { subject: sub, userId: `user_${sub}`, email, emailProven, memberships: [], scopes: [] };
}

/** La base de l'accès aux fonctionnalités, en mémoire, et ce qu'on lui a demandé. */
class StubLookup extends FeatureLevelLookup {
  override: string | null = null;
  exempt: readonly string[] = [];
  reads = 0;

  storedOverride(): Promise<string | null> {
    this.reads += 1;
    return Promise.resolve(this.override);
  }

  isExempt(_key: string, normalizedEmail: string): Promise<boolean> {
    this.reads += 1;
    return Promise.resolve(this.exempt.includes(normalizedEmail));
  }
}

/** Le resolver d'identité : le jeton EST le `sub`, et seules nos trois personnes existent. */
class StubPrincipalResolver extends PrincipalResolver {
  resolve(token: VerifiedToken): Promise<Principal> {
    const found = PRINCIPALS[token.subject];
    return found === undefined ? Promise.reject(new Error("inconnu")) : Promise.resolve(found);
  }
}

const verifierStub = {
  verify: (token: string): Promise<VerifiedToken> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

@Controller("probe")
class ProbeController {
  @Get("unmarked")
  unmarked(): string {
    return "ok";
  }

  @Public()
  @RequiresShop("browse")
  @Get("public-browse")
  publicBrowse(): string {
    return "ok";
  }

  @RequiresShop("browse")
  @Get("browse")
  browse(): string {
    return "ok";
  }

  @RequiresShop("order")
  @Post("order")
  order(): string {
    return "ok";
  }
}

/** Un marqueur posé sur la CLASSE vaut pour chacune de ses routes. */
@Controller("class-marked")
@RequiresShop("order")
class ClassMarkedController {
  @Get()
  read(): string {
    return "ok";
  }
}

describe("FeatureAccessGuard — enregistrée après AuthGuard", () => {
  let app: INestApplication<App>;
  const lookup = new StubLookup();

  beforeEach(async () => {
    lookup.override = null;
    lookup.exempt = [];
    lookup.reads = 0;
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController, ClassMarkedController],
      providers: [
        { provide: AccessTokenVerifier, useValue: verifierStub },
        { provide: PrincipalResolver, useClass: StubPrincipalResolver },
        { provide: DevImpersonation, useValue: { enabled: false } },
        { provide: FeatureLevelLookup, useValue: lookup },
        FeatureLevelResolver,
        // Le même ordre que `app.module.ts` : c'est lui qu'on éprouve.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: FeatureAccessGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const as = (
    sub: string,
  ): { get: (path: string) => request.Test; post: (path: string) => request.Test } => ({
    get: (path) => request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${sub}`),
    post: (path) => request(app.getHttpServer()).post(path).set("Authorization", `Bearer ${sub}`),
  });

  it("laisse passer une route non marquée sans rien lire, même boutique fermée", async () => {
    lookup.override = "closed";

    await as("client").get("/probe/unmarked").expect(200);
    expect(lookup.reads).toBe(0);
  });

  it("refuse en 409 une route `browse` quand la boutique est fermée, avec le message du niveau", async () => {
    lookup.override = "closed";

    const refused = await as("client").get("/probe/browse").expect(409);

    expect(refused.body).toMatchObject({
      code: "feature_access.shop_closed_for_browse",
      message: "La boutique n'est pas encore ouverte.",
    });
  });

  it("sert `browse` au niveau `browse`, et refuse `order` en 409", async () => {
    lookup.override = "browse";

    await as("client").get("/probe/browse").expect(200);
    const refused = await as("client").post("/probe/order").expect(409);

    expect(refused.body).toMatchObject({
      code: "feature_access.shop_closed_for_order",
      message: "Les commandes en ligne ne sont pas encore ouvertes.",
    });
  });

  it("ouvre tout au niveau `order`, marqueur de classe compris", async () => {
    lookup.override = "order";

    await as("client").post("/probe/order").expect(201);
    await as("client").get("/class-marked").expect(200);
  });

  it("applique le marqueur de classe", async () => {
    lookup.override = "browse";

    await as("client").get("/class-marked").expect(409);
  });

  it("voit le `Principal` : un exempté PROUVÉ commande boutique fermée", async () => {
    // Si la garde tournait avant `AuthGuard`, elle ne verrait personne et ce
    // testeur serait refusé comme n'importe qui (plan §10, vérifié ici).
    lookup.override = "closed";
    lookup.exempt = [TESTER_EMAIL];

    await as("proven").post("/probe/order").expect(201);
  });

  it("refuse l'exempté NON prouvé : son adresse ne se cherche même pas", async () => {
    lookup.override = "closed";
    lookup.exempt = [TESTER_EMAIL];

    await as("unproven").post("/probe/order").expect(409);
  });

  it("n'exempte personne sur une route publique : il n'y a pas de `Principal`", async () => {
    lookup.override = "closed";
    lookup.exempt = [TESTER_EMAIL];

    await request(app.getHttpServer()).get("/probe/public-browse").expect(409);
    // Même porteur d'un jeton prouvé : `AuthGuard` ne résout rien sur une route publique.
    await as("proven").get("/probe/public-browse").expect(409);
  });

  it("sert la route publique marquée dès que la boutique est au niveau exigé", async () => {
    lookup.override = "browse";

    await request(app.getHttpServer()).get("/probe/public-browse").expect(200);
  });
});
