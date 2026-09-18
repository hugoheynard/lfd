import {
  Catch,
  Controller,
  Get,
  HttpException,
  Req,
  type ArgumentsHost,
  type ExceptionFilter,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Response } from "express";
import request from "supertest";
import type { App } from "supertest/types";

import { AppConfig } from "../../config/app-config.js";
import type { Actor } from "../../context/request-context.js";
import { requestContextMiddleware } from "../../context/request-context.middleware.js";
import { currentRequestContext } from "../../context/request-context.store.js";
import { AdminAuthGuard } from "../admin-auth.guard.js";
import { AdminSurface, RequirePermission } from "../admin-surface.decorator.js";
import { AdminTokenVerifier } from "../admin-token.verifier.js";
import { StaffAccessGuard } from "../staff-access.guard.js";
import { StaffAccessResolver } from "../staff-access.resolver.js";
import type { AuthenticatedStaffRequest, StaffAccess, StaffPrincipal } from "../staff-principal.js";
import { takeVerifiedStaff } from "../verified-staff-identity.js";

/**
 * **Qui l'acteur du contexte désigne** après les deux gardes staff (plan de
 * l'auteur, D1 et D2).
 *
 * Jusqu'au 2026-09-18, `AdminAuthGuard` posait le `sub` du jeton comme acteur,
 * et c'est ce `sub` qui finissait dans `activity_events.actor_id` et dans une
 * dizaine de colonnes d'auteur. Ces tests tiennent la bascule : l'acteur est
 * l'id de la fiche, posé par le seul garde qui la connaît, et une requête
 * refusée n'est attribuée à personne.
 */

const FICHE_ID = "fiche-camille";

/** Le jeton EST le `sub` — la signature n'est pas ce qu'on éprouve ici. */
const tokenIsSubject = {
  verify: (token: string): Promise<StaffPrincipal> =>
    Promise.resolve({ subject: token, email: undefined, emailVerified: undefined, scopes: [] }),
};

/** L'annuaire : `auth0|camille` est la fiche {@link FICHE_ID}, lecture seule. */
class OneStaffDirectory extends StaffAccessResolver {
  resolve(principal: StaffPrincipal): Promise<StaffAccess | null> {
    if (principal.subject !== "auth0|camille") {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      staffUserId: FICHE_ID,
      role: "commercial",
      permissions: ["b2b_orders:read"],
    });
  }

  forgetAll(): void {
    // Rien à oublier : pas de cache.
  }
}

interface ProbeAnswer {
  readonly actor: Actor | null;
  readonly subjectStillDeposited: boolean;
}

@Controller("admin/probe-actor")
@AdminSurface("b2b_orders")
class ProbeActorController {
  @Get()
  read(@Req() req: AuthenticatedStaffRequest): ProbeAnswer {
    return {
      actor: currentRequestContext()?.actor ?? null,
      subjectStillDeposited: takeVerifiedStaff(req) !== undefined,
    };
  }

  @Get("ecrire")
  @RequirePermission("b2b_orders:write")
  write(): string {
    return "jamais atteint";
  }
}

/** Rend l'acteur du contexte AU MOMENT du refus — c'est lui qu'on éprouve. */
@Catch(HttpException)
class ActorAtRefusal implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .json({ actor: currentRequestContext()?.actor ?? null });
  }
}

async function boot(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeActorController],
    providers: [
      AdminAuthGuard,
      StaffAccessGuard,
      { provide: AppConfig, useValue: { adminDevBypass: (): boolean => false } },
      { provide: AdminTokenVerifier, useValue: tokenIsSubject },
      { provide: StaffAccessResolver, useClass: OneStaffDirectory },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(requestContextMiddleware);
  app.useGlobalFilters(new ActorAtRefusal());
  await app.init();
  return app;
}

describe("StaffAccessGuard — l'acteur est la fiche", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await boot();
  });
  afterEach(async () => {
    await app.close();
  });

  it("pose l'id de fiche comme acteur, jamais le sub du jeton", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/probe-actor")
      .set("Authorization", "Bearer auth0|camille")
      .expect(200);

    expect(response.body).toMatchObject({ actor: { type: "staff", id: FICHE_ID } });
  });

  it("ne laisse plus le sub atteignable une fois la fiche résolue", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/probe-actor")
      .set("Authorization", "Bearer auth0|camille")
      .expect(200);

    expect(response.body).toMatchObject({ subjectStillDeposited: false });
  });

  it("n'attache rien quand l'annuaire ignore le porteur", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/probe-actor")
      .set("Authorization", "Bearer auth0|inconnu")
      .expect(403);

    expect(response.body).toEqual({ actor: { type: "system", id: null } });
  });

  it("n'attache rien quand la permission manque, fiche connue ou non", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/probe-actor/ecrire")
      .set("Authorization", "Bearer auth0|camille")
      .expect(403);

    expect(response.body).toEqual({ actor: { type: "system", id: null } });
  });

  it("n'attache rien quand le jeton manque", async () => {
    const response = await request(app.getHttpServer()).get("/admin/probe-actor").expect(401);

    expect(response.body).toEqual({ actor: { type: "system", id: null } });
  });
});
