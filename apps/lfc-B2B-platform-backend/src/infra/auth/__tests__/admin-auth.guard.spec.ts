import { Controller, Get, Req, UseGuards, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { BOOTSTRAP_ADMIN_EMAIL } from "../../../staff-users/domain/bootstrap-admin.js";
import { AppConfig } from "../../config/app-config.js";
import { AdminAuthGuard } from "../admin-auth.guard.js";
import { AdminTokenVerifier } from "../admin-token.verifier.js";
import { Public } from "../public.decorator.js";
import type { AuthenticatedStaffRequest, StaffPrincipal } from "../staff-principal.js";

/**
 * Verifier staff factice : un jeton commençant par `bad` est refusé (signature) ;
 * sinon le `sub` retourné EST la valeur du jeton.
 */
const verifierStub = {
  verify: (jeton: string): Promise<StaffPrincipal> =>
    jeton.startsWith("bad")
      ? Promise.reject(new Error("signature refusée"))
      : Promise.resolve({ subject: jeton, scopes: ["read:companies"] }),
};

/** Contrôleur sonde : route admin, gardée staff, publique vis-à-vis du guard client. */
@Controller("admin")
@Public()
@UseGuards(AdminAuthGuard)
class ProbeAdminController {
  @Get("probe")
  probe(@Req() req: AuthenticatedStaffRequest): StaffPrincipal | undefined {
    return req.staff;
  }
}

async function bootProbe(bypass: boolean): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeAdminController],
    providers: [
      AdminAuthGuard,
      { provide: AppConfig, useValue: { adminDevBypass: (): boolean => bypass } },
      { provide: AdminTokenVerifier, useValue: verifierStub },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
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

  it("accepte SANS jeton et pose un staff synthétique", async () => {
    const response = await request(app.getHttpServer()).get("/admin/probe").expect(200);
    expect(response.body).toEqual({
      subject: "dev-staff",
      email: BOOTSTRAP_ADMIN_EMAIL,
      scopes: [],
    });
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

  it("accepte un jeton staff valide et expose le StaffPrincipal", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/probe")
      .set("Authorization", "Bearer staff|alice")
      .expect(200);
    expect(response.body).toEqual({ subject: "staff|alice", scopes: ["read:companies"] });
  });
});
