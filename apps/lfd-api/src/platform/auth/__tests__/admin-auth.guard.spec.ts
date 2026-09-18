import { Controller, Get, Req, UseGuards, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";

import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL } from "../../config/bootstrap-admin-email.js";
import { AppConfig } from "../../config/app-config.js";
import type { Actor } from "../../context/request-context.js";
import { requestContextMiddleware } from "../../context/request-context.middleware.js";
import { currentRequestContext } from "../../context/request-context.store.js";
import { AdminAuthGuard } from "../admin-auth.guard.js";
import { AdminTokenVerifier } from "../admin-token.verifier.js";
import { Public } from "../public.decorator.js";
import type { AuthenticatedStaffRequest, StaffPrincipal } from "../staff-principal.js";
import { takeVerifiedStaff } from "../verified-staff-identity.js";

/**
 * Verifier staff factice : un jeton commençant par `bad` est refusé (signature) ;
 * sinon le `sub` retourné EST la valeur du jeton.
 */
const verifierStub = {
  verify: (jeton: string): Promise<StaffPrincipal> =>
    jeton.startsWith("bad")
      ? Promise.reject(new Error("signature refusée"))
      : Promise.resolve({
          subject: jeton,
          email: undefined,
          emailVerified: undefined,
          scopes: ["read:companies"],
        }),
};

/**
 * Ce que la sonde voit : l'identité déposée dans le canal interne, l'acteur du
 * contexte, et si la requête expose encore un champ `staff` à un contrôleur.
 */
interface ProbeAnswer {
  readonly principal: StaffPrincipal | null;
  readonly actor: Actor | null;
  readonly exposedOnRequest: boolean;
}

/** Contrôleur sonde : route admin, gardée staff, publique vis-à-vis du guard client. */
@Controller("admin")
@Public()
@UseGuards(AdminAuthGuard)
class ProbeAdminController {
  @Get("probe")
  probe(@Req() req: AuthenticatedStaffRequest): ProbeAnswer {
    return {
      principal: takeVerifiedStaff(req) ?? null,
      actor: currentRequestContext()?.actor ?? null,
      exposedOnRequest: "staff" in req,
    };
  }
}

async function bootProbe(bypass: boolean): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeAdminController],
    providers: [
      AdminAuthGuard,
      {
        provide: AppConfig,
        useValue: {
          adminDevBypass: (): boolean => bypass,
          bootstrapAdminEmail: (): string => DEFAULT_BOOTSTRAP_ADMIN_EMAIL,
        },
      },
      { provide: AdminTokenVerifier, useValue: verifierStub },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(requestContextMiddleware);
  await app.init();
  return app;
}

describe("AdminAuthGuard — bypass de dev", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await bootProbe(true);
  });
  afterEach(async () => {
    await app.close();
  });

  it("accepte SANS jeton et dépose un staff synthétique", async () => {
    const response = await request(app.getHttpServer()).get("/admin/probe").expect(200);
    expect(response.body).toMatchObject({
      principal: {
        subject: "dev-staff",
        email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL,
        emailVerified: true,
        scopes: [],
      },
    });
  });

  it("n'attache pas d'acteur : c'est la fiche, résolue ensuite, qui le sera", async () => {
    // Régression : le contournement posait `dev-staff` comme acteur, et tout
    // ce qu'on écrivait en local était signé d'un auteur qui n'est personne.
    const response = await request(app.getHttpServer()).get("/admin/probe").expect(200);
    expect(response.body).toMatchObject({ actor: { type: "system", id: null } });
  });
});

describe("AdminAuthGuard — vérification staff (prod)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await bootProbe(false);
  });
  afterEach(async () => {
    await app.close();
  });

  it("refuse sans en-tête Authorization", async () => {
    await request(app.getHttpServer()).get("/admin/probe").expect(401);
  });

  it("refuse un schéma non-Bearer", async () => {
    await request(app.getHttpServer())
      .get("/admin/probe")
      .set("Authorization", "Basic abc")
      .expect(401);
  });

  it("refuse un jeton dont la signature est invalide", async () => {
    await request(app.getHttpServer())
      .get("/admin/probe")
      .set("Authorization", "Bearer bad-token")
      .expect(401);
  });

  it("accepte un jeton staff valide et dépose le StaffPrincipal dans le canal interne", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/probe")
      .set("Authorization", "Bearer staff|alice")
      .expect(200);
    expect(response.body).toMatchObject({
      principal: { subject: "staff|alice", scopes: ["read:companies"] },
      exposedOnRequest: false,
    });
  });

  it("n'attache pas le sub comme acteur", async () => {
    // Régression : `AdminAuthGuard` posait `{ type: "staff", id: <sub> }`, et ce
    // `sub` finissait dans `activity_events.actor_id` (plan de l'auteur, D1).
    const response = await request(app.getHttpServer())
      .get("/admin/probe")
      .set("Authorization", "Bearer staff|alice")
      .expect(200);
    expect(response.body).toMatchObject({ actor: { type: "system", id: null } });
  });
});
