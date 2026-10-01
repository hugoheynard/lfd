/**
 * E2E de l'écriture du **code NAF** contre la vraie base (2026-10-01).
 *
 * Régression (2026-10-01) : la résolution du NAF, en tâche de fond, sauvait la
 * société ENTIÈRE chargée avant l'appel à l'API entreprises — une activation et
 * un terme posés entre-temps repartaient en `pending`, sans terme.
 */
import { CompanyNafWriter } from "../src/b2b/account/domain/ports/company-naf.writer.js";
import { CompanyRepository } from "../src/b2b/account/domain/ports/company.repository.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Instant d'activation : comparé à lui-même seulement, jamais à l'horloge. */
const ACTIVATED_AT = new Date("2026-08-11T10:00:00.000Z");
const STAFF = { staffUserId: "staff_1", name: "Jeanne Martin", role: "admin" };

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

it("le NAF écrit depuis un agrégat périmé ne défait ni l'activation ni le terme", async () => {
  const { id } = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
  const companies = ctx.app.get(CompanyRepository);

  // Chargée par l'abonné AVANT l'appel réseau…
  const stale = await companies.load(id);
  // … pendant que le staff active et accorde un terme.
  const fresh = await companies.load(id);
  fresh?.activate(ACTIVATED_AT, true, STAFF);
  fresh?.grantTerms(["monthly"]);
  if (stale === null || fresh === null) {
    throw new Error("la société semée doit se charger");
  }
  await companies.save(fresh);

  stale.assignNaf("56.10A");
  await ctx.app.get(CompanyNafWriter).saveNaf(stale);

  const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id } });
  expect(row).toMatchObject({
    status: CompanyStatus.active,
    grantedTerms: ["monthly"],
    nafCode: "56.10A",
    activatedAt: ACTIVATED_AT,
  });
});
