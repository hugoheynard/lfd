/**
 * E2E de la **reprise de l'auteur des fiches** —
 * `documentation/b2b/plan-suivi-commercial.md`, § 3.1.
 *
 * Ce que seul le vrai SQL prouve : les deux lectures (une par schéma) se
 * joignent en mémoire ; un principal déclaré par l'équipe reçoit son auteur
 * et son suiveur, un site et une inscription du client restent vides ; à
 * blanc rien n'est écrit, et une seconde passe ne trouve plus rien.
 */
import { planCompanyOpeners } from "../src/lafoliecoffee/account/infrastructure/company-opener-backfill-plan.js";
import { PrismaCompanyOpenerBackfill } from "../src/lafoliecoffee/account/infrastructure/prisma-company-opener-backfill.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

beforeEach(async () => {
  await ctx.reset();
});

afterAll(async () => {
  await ctx.close();
});

/** Le fait `company.declared` tel que l'abonné du journal l'écrit. */
async function declared(
  companyId: string,
  actor: { type: string; id: string | null; name: string | null },
): Promise<void> {
  sequence += 1;
  await ctx.prisma.activityEvent.create({
    data: {
      id: `evt_${String(sequence).padStart(6, "0")}`,
      type: "company.declared",
      occurredAt: new Date(daysAgo(30)),
      subjectType: "company",
      subjectId: companyId,
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      traceId: "0".repeat(32),
      idempotencyKey: `company.declared:${companyId}`,
      payload: {
        subjectLabel: "Fiche",
        via: actor.type === "staff" ? "staff" : "self",
        owner: null,
      },
    },
  });
}

async function openers(id: string) {
  return ctx.prisma.company.findUniqueOrThrow({
    where: { id },
    select: { declaredByStaffId: true, declaredByName: true, followedByStaffId: true },
  });
}

async function pass(write: boolean) {
  const backfill = new PrismaCompanyOpenerBackfill(ctx.prisma);
  const companies = await backfill.companiesWithoutOpener();
  const lines = planCompanyOpeners(
    companies,
    await backfill.declarationsOf(companies.map((company) => company.id)),
  );
  if (write) {
    for (const line of lines) {
      if (line.kind === "fill") await backfill.write(line);
    }
  }
  return lines;
}

describe("reprise de l'auteur des fiches", () => {
  it("remplit le principal ouvert par l'équipe, laisse vides le site et l'inscription", async () => {
    const opened = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    const self = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    const site = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: opened.id },
    });
    await declared(opened.id, { type: "staff", id: "staff_lou", name: "Lou Martin" });
    await declared(self.id, { type: "customer", id: "user_1", name: null });
    await declared(site.id, { type: "staff", id: "staff_lou", name: "Lou Martin" });

    const dry = await pass(false);
    // Le site n'est même pas lu : c'est de la structure, pas de l'acquisition.
    expect(dry.map((line) => line.companyId).sort()).toEqual([opened.id, self.id].sort());
    expect(await openers(opened.id)).toEqual({
      declaredByStaffId: null,
      declaredByName: null,
      followedByStaffId: null,
    });

    await pass(true);

    expect(await openers(opened.id)).toEqual({
      declaredByStaffId: "staff_lou",
      declaredByName: "Lou Martin",
      followedByStaffId: "staff_lou",
    });
    expect((await openers(self.id)).declaredByStaffId).toBeNull();
    expect((await openers(site.id)).declaredByStaffId).toBeNull();

    const again = await pass(false);
    expect(again.filter((line) => line.kind === "fill")).toEqual([]);
  });

  it("ne remplace pas un suiveur déjà posé", async () => {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { followedByStaffId: "staff_ana" },
    });
    await declared(company.id, { type: "staff", id: "staff_lou", name: null });

    await pass(true);

    expect(await openers(company.id)).toEqual({
      declaredByStaffId: "staff_lou",
      declaredByName: null,
      followedByStaffId: "staff_ana",
    });
  });
});
