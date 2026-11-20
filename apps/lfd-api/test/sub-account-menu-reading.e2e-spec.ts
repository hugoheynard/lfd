/**
 * E2E de **la lecture de la carte d'un sous-compte** (plan
 * `documentation/comptes-client/plan-carte-des-sites.md`, § 3.1 et § 4, lot
 * C1) — sur la base migrée, par les deux requêtes partagées du lecteur pro.
 *
 * - la carte, écrite par le dépôt de l'agrégat, se relit telle qu'écrite ;
 * - `readServedCompany` et `readReservationHolders` la rendent sous un
 *   principal actif, et rien sous un principal suspendu (elle dort) ;
 * - les CHECK de la migration refusent une valeur inconnue.
 *
 * Aucune date absolue comparée à l'horloge : l'instant du geste n'est
 * comparé qu'à lui-même.
 */
import { SubAccountMenu } from "../src/lafoliecoffee/account/domain/entities/sub-account-menu.js";
import type { MenuStamp } from "../src/lafoliecoffee/account/domain/value-objects/sub-account-menu-terms.js";
import { PrismaSubAccountMenuRepository } from "../src/lafoliecoffee/account/infrastructure/prisma-sub-account-menu.repository.js";
import {
  readReservationHolders,
  readServedCompany,
} from "../src/lafoliecoffee/shared/company-standing/infrastructure/read-reservation-holders.js";
import { ShelfChanges } from "../src/lafoliecoffee/shared/shelf-changes/domain/ports/shelf-changes.js";
import type { ShelfChangeScope } from "../src/lafoliecoffee/shared/shelf-changes/domain/shelf-change-scope.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Les signaux des rayons, gardés pour qu'on les relise. */
class RecordingShelfChanges extends ShelfChanges {
  readonly scopes: ShelfChangeScope[] = [];

  changed(scope: ShelfChangeScope): void {
    this.scopes.push(scope);
  }
}

const STAMP: MenuStamp = { author: { kind: "staff", staffId: "stf_menu" }, at: new Date(0) };

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Un principal au statut voulu, un site rattaché, et la carte du site posée. */
async function siteWithMenu(principalStatus: CompanyStatus): Promise<string> {
  const principal = await createCompany(ctx.prisma, { status: principalStatus });
  const site = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: site.id },
    data: { parentCompanyId: principal.id },
  });
  const menu = SubAccountMenu.compose({
    companyId: site.id,
    principalCompanyId: principal.id,
    mode: "except",
    offMenu: "visible_locked",
    stamp: STAMP,
  });
  menu.exclude({ id: "ent_1", level: "family", ref: "fam_patisserie" }, STAMP);
  menu.include({ id: "ent_2", level: "product", ref: "TARTE-CITRON" }, STAMP);
  await new PrismaSubAccountMenuRepository(ctx.prisma, new RecordingShelfChanges()).save(menu);
  return site.id;
}

const EXPECTED = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [
    { level: "family", ref: "fam_patisserie", effect: "exclude" },
    { level: "product", ref: "TARTE-CITRON", effect: "include" },
  ],
};

describe("la carte d'un sous-compte, lue avec le lecteur pro", () => {
  it("se relit par le dépôt telle qu'elle s'écrit, et le rayon du site est prévenu", async () => {
    const shelves = new RecordingShelfChanges();
    const siteId = await siteWithMenu(CompanyStatus.active);
    const repo = new PrismaSubAccountMenuRepository(ctx.prisma, shelves);
    const menu = await repo.load(siteId);
    expect(menu?.entries.map((e) => e.ref)).toEqual(["fam_patisserie", "TARTE-CITRON"]);

    menu?.remove("family", "fam_patisserie", STAMP);
    if (menu !== null && menu !== undefined) {
      await repo.save(menu);
    }
    expect((await repo.load(siteId))?.entries.map((e) => e.ref)).toEqual(["TARTE-CITRON"]);
    expect(shelves.scopes).toHaveLength(1);
  });

  it("les deux chemins la rendent sous un principal actif", async () => {
    const siteId = await siteWithMenu(CompanyStatus.active);
    expect((await readServedCompany(ctx.prisma, siteId))?.menu).toEqual(EXPECTED);
    expect((await readReservationHolders(ctx.prisma, siteId)).menu).toEqual(EXPECTED);
  });

  it("elle dort sous un principal suspendu : aucun des deux chemins ne la rend", async () => {
    const siteId = await siteWithMenu(CompanyStatus.suspended);
    expect((await readServedCompany(ctx.prisma, siteId))?.menu).toBeNull();
    expect((await readReservationHolders(ctx.prisma, siteId)).menu).toBeNull();
    // Rien n'est supprimé : la carte est toujours en base.
    expect(await ctx.prisma.subAccountMenuEntry.count({ where: { companyId: siteId } })).toBe(2);
  });

  it("une société sans carte n'en rend aucune", async () => {
    const alone = await createCompany(ctx.prisma);
    expect((await readServedCompany(ctx.prisma, alone.id))?.menu).toBeNull();
    expect((await readReservationHolders(ctx.prisma, alone.id)).menu).toBeNull();
  });

  it("la base refuse une valeur que la carte ne connaît pas", async () => {
    const siteId = await siteWithMenu(CompanyStatus.active);
    await expect(
      ctx.prisma.subAccountMenuEntry.create({
        data: { id: "ent_x", companyId: siteId, level: "category", ref: "x", effect: "include" },
      }),
    ).rejects.toThrow();
  });
});
