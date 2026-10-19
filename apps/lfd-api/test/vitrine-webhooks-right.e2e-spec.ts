/**
 * E2E du **droit `lfd_webhooks`**, qui remplace `shop_vitrine` (Hugo,
 * 2026-10-19 : « l'édition de la vitrine et les webhooks, c'est différent »).
 *
 * Ce qui se prouve sur la vraie base : `lfd_webhooks` ouvre les routes
 * `/admin/vitrine/*` (lecture en lecture, écriture en écriture), et
 * `shop_vitrine` — encore porté en base par les rôles d'avant la bascule —
 * n'ouvre plus rien, annonces comprises. Les rôles qui le portent sont posés
 * en base, comme la production les garde : l'écran refuse de les écrire.
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

type Grant = {
  readonly resource: "lfd_webhooks" | "shop_vitrine";
  readonly action: "read" | "write";
};

/** Un rôle tel que la base le garde, et une personne active qui le porte. */
async function holderOf(key: string, grants: readonly Grant[]): Promise<string> {
  await ctx.prisma.staffRoleDefinition.create({ data: { key, label: key, grants: [...grants] } });
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Léa",
      lastName: key,
      email: `${key}@lfc.test`,
      roleKey: key,
      role: null,
      status: "active",
      auth0Id: `sub-${key}`,
    },
  });
  return `sub-${key}`;
}

const NOTICE = { subject: "Objet", body: "Corps de l'annonce." };

describe("le droit `lfd_webhooks`", () => {
  it("en lecture, ouvre les abonnés et les annonces, et ferme l'écriture", async () => {
    const sub = await holderOf("webhooks-lecture", [{ resource: "lfd_webhooks", action: "read" }]);
    await ctx.asSub(sub).get("/admin/vitrine/subscribers").expect(200);
    await ctx.asSub(sub).get("/admin/vitrine/notices").expect(200);
    await ctx.asSub(sub).post("/admin/vitrine/notices").send(NOTICE).expect(403);
  });
});

describe("un rôle qui porte encore `shop_vitrine`", () => {
  /** Régression : l'ancien droit, mal nommé, ne doit plus rien ouvrir (2026-10-19). */
  it("est refusé partout, lecture comme écriture, annonces comprises", async () => {
    const sub = await holderOf("ancienne-vitrine", [{ resource: "shop_vitrine", action: "write" }]);
    await ctx.asSub(sub).get("/admin/vitrine/subscribers").expect(403);
    await ctx.asSub(sub).get("/admin/vitrine/notices").expect(403);
    await ctx.asSub(sub).post("/admin/vitrine/notices/preview").send(NOTICE).expect(403);
    await ctx.asSub(sub).post("/admin/vitrine/notices").send(NOTICE).expect(403);
    await ctx
      .asSub(sub)
      .post("/admin/vitrine/subscribers")
      .send({ label: "Agence", url: "https://agence.example/hook" })
      .expect(403);
  });
});
