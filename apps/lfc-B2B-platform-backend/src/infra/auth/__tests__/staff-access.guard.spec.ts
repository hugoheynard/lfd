import type { StaffPermission } from "@lfd/contracts";
import { Controller, Get, Patch, Post, UseGuards, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppConfig } from "../../config/app-config.js";
import { AdminAuthGuard } from "../admin-auth.guard.js";
import { AdminTokenVerifier } from "../admin-token.verifier.js";
import { AdminSelfSurface, AdminSurface, RequirePermission } from "../admin-surface.decorator.js";
import { Public } from "../public.decorator.js";
import { StaffAccessGuard } from "../staff-access.guard.js";
import { StaffAccessResolver } from "../staff-access.resolver.js";

/**
 * Le guard, éprouvé sur ses **bords** : ce que le verbe déduit, ce qu'une
 * déclaration explicite écrase, et ce qu'un montage incomplet doit refuser.
 *
 * Les surfaces réelles sont couvertes en e2e ; ici on monte des contrôleurs
 * sondes pour atteindre des combinaisons qui n'existent (heureusement) nulle
 * part dans l'app — c'est justement le rôle d'un test de bord.
 */

/**
 * Le bypass de dev pose l'identité staff : on monte donc les sondes avec le
 * **vrai** `@AdminSurface`, guard d'entrée compris, plutôt qu'avec une porte de
 * test — c'est la composition réelle qu'on veut éprouver.
 */
const configStub = {
  adminDevBypass: (): boolean => true,
  bootstrapAdminEmail: (): string => "racine@lfc.test",
};

@Controller("admin/probe-orders")
@AdminSurface("orders")
class ProbeOrdersController {
  @Get()
  read(): string {
    return "read";
  }

  @Post()
  write(): string {
    return "write";
  }

  /** Le verbe dit « écrire », l'intention dit « lire ». La déclaration gagne. */
  @Patch("search")
  @RequirePermission("orders:read")
  search(): string {
    return "search";
  }
}

/** Surface réflexive AVEC une exigence explicite : la plus stricte l'emporte. */
@Controller("admin/probe-me")
@AdminSelfSurface()
class ProbeReflexiveController {
  @Get()
  me(): string {
    return "me";
  }

  @Get("restreint")
  @RequirePermission("staff:read")
  restricted(): string {
    return "restreint";
  }
}

/** Le montage oublié : les guards sont là, la ressource non. */
@Controller("admin/probe-nue")
@Public()
@UseGuards(AdminAuthGuard, StaffAccessGuard)
class ProbeUndeclaredController {
  @Get()
  open(): string {
    return "open";
  }
}

async function bootWith(permissions: readonly StaffPermission[]): Promise<INestApplication<App>> {
  const resolver = {
    resolve: (): Promise<{ staffUserId: string; role: string; permissions: readonly string[] }> =>
      Promise.resolve({ staffUserId: "s1", role: "comptabilite", permissions }),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeOrdersController, ProbeReflexiveController, ProbeUndeclaredController],
    providers: [
      StaffAccessGuard,
      AdminAuthGuard,
      { provide: AppConfig, useValue: configStub },
      { provide: AdminTokenVerifier, useValue: {} },
      { provide: StaffAccessResolver, useValue: resolver },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe("StaffAccessGuard — le verbe dit l'action", () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it("laisse lire avec la seule lecture, et refuse d'écrire", async () => {
    app = await bootWith(["orders:read"]);

    await request(app.getHttpServer()).get("/admin/probe-orders").expect(200);
    await request(app.getHttpServer()).post("/admin/probe-orders").expect(403);
  });

  it("traite HEAD comme une lecture", async () => {
    // Nest route HEAD sur le handler GET : sans ce cas dans la liste, un HEAD
    // exigerait l'écriture et un simple test de disponibilité serait refusé.
    app = await bootWith(["orders:read"]);

    await request(app.getHttpServer()).head("/admin/probe-orders").expect(200);
  });

  it("laisse écrire quand l'écriture est là", async () => {
    app = await bootWith(["orders:read", "orders:write"]);

    await request(app.getHttpServer()).post("/admin/probe-orders").expect(201);
  });
});

describe("StaffAccessGuard — la déclaration explicite gagne", () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it("accepte un PATCH qui ne demande que la lecture", async () => {
    // Le cas où le verbe ment sur l'intention : une recherche en POST/PATCH.
    app = await bootWith(["orders:read"]);

    await request(app.getHttpServer()).patch("/admin/probe-orders/search").expect(200);
  });

  it("n'est PAS avalée par une surface réflexive", async () => {
    // Le piège silencieux : `/admin/me` n'exige aucune permission, donc une
    // `@RequirePermission` posée dessus pourrait être ignorée sans bruit — on
    // croirait avoir restreint une route qui ne l'est pas.
    app = await bootWith(["orders:read"]);

    await request(app.getHttpServer()).get("/admin/probe-me").expect(200);
    await request(app.getHttpServer()).get("/admin/probe-me/restreint").expect(403);
  });
});

describe("StaffAccessGuard — fail-closed", () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it("refuse une surface sans ressource déclarée, même à qui a tout", async () => {
    // Un contrôleur copié d'un voisin, sans la ligne qui compte : il ne doit pas
    // s'ouvrir parce que l'appelant se trouve être administrateur.
    app = await bootWith(["orders:read", "orders:write", "staff:read", "staff:write"]);

    await request(app.getHttpServer()).get("/admin/probe-nue").expect(403);
  });
});
