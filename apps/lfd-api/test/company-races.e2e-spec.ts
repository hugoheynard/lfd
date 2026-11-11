/**
 * E2E des **écritures concurrentes sur une société** — sur un vrai Postgres.
 *
 * Deux gestes chargent la même société, chacun la modifie, chacun l'enregistre.
 * Ce que seul le vrai SQL prouve : le second n'efface pas ce que le premier a
 * écrit sur une autre colonne, une réactivation ne rouvre pas un compte
 * résilié entre-temps, et deux premières saisies de la facturation n'en
 * créent qu'une.
 */
import { CompanyChangedMeanwhileError } from "../src/lafoliecoffee/account/domain/errors/account-errors.js";
import { CompanyAddressRepository } from "../src/lafoliecoffee/account/domain/ports/company-address.repository.js";
import { CompanyRepository } from "../src/lafoliecoffee/account/domain/ports/company.repository.js";
import { AddressKind, CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const BILLING = {
  label: "Siège",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
};

/** Assez long pour qu'une écriture sans verrou ait fini. */
const LOCK_WAIT_MS = 300;

let ctx: E2eContext;
let companies: CompanyRepository;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  companies = ctx.app.get(CompanyRepository);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Les deux chargements d'un même geste concurrent : aucun ne voit l'autre. */
async function loadTwice(companyId: string) {
  const first = await companies.load(companyId);
  const second = await companies.load(companyId);
  if (first === null || second === null) {
    throw new Error("société semée introuvable");
  }
  return [first, second] as const;
}

/**
 * Régression : `save()` réécrivait toute la ligne depuis l'état chargé, si
 * bien que le second geste effaçait le premier sur une autre colonne.
 */
it("deux gestes sur des colonnes différentes gardent chacun ce qu'il a écrit", async () => {
  const company = await createCompany(ctx.prisma, { enseigne: "Avant", nafCode: "" });
  const [identity, naf] = await loadTwice(company.id);

  identity.editSoftIdentity({ enseigne: "Le Comptoir", vatNumber: "" });
  naf.assignNaf("56.10A");
  await companies.save(identity);
  await companies.save(naf);

  const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: company.id } });
  expect(row).toMatchObject({ enseigne: "Le Comptoir", nafCode: "56.10A" });
});

/**
 * Régression : une réactivation partie d'une fiche « suspendue » rouvrait un
 * compte résilié entre-temps — l'écriture ne regardait pas le statut en base.
 */
it("une réactivation ne rouvre pas un compte résilié entre-temps", async () => {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.suspended });
  const [reactivation, termination] = await loadTwice(company.id);

  termination.terminate();
  await companies.save(termination);
  reactivation.reactivate();

  await expect(companies.save(reactivation)).rejects.toBeInstanceOf(CompanyChangedMeanwhileError);
  const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: company.id } });
  expect(row.status).toBe(CompanyStatus.terminated);
});

it("un geste qui ne change pas le statut passe, même si le statut a bougé entre-temps", async () => {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  const [identity, suspension] = await loadTwice(company.id);

  suspension.suspend("staff");
  await companies.save(suspension);
  identity.editSoftIdentity({ enseigne: "Le Comptoir", vatNumber: "" });
  await companies.save(identity);

  const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: company.id } });
  expect(row).toMatchObject({ status: CompanyStatus.suspended, enseigne: "Le Comptoir" });
});

/**
 * Régression : chacune de deux premières saisies simultanées voyait « aucune
 * facturation » et en créait une — la société en gardait deux.
 *
 * La course elle-même ne se reproduit pas à coup sûr ici ; ce qui la ferme se
 * prouve : l'enregistrement prend le verrou de la société, donc il attend
 * qu'un autre geste qui le tient ait fini.
 */
it("la saisie de la facturation attend le verrou de la société", async () => {
  const company = await createCompany(ctx.prisma);
  const addresses = ctx.app.get(CompanyAddressRepository);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let taken: () => void = () => undefined;
  const lockTaken = new Promise<void>((resolve) => {
    taken = resolve;
  });
  const holder = ctx.prisma.$transaction(async (tx) => {
    // `FOR NO KEY UPDATE` : il bloque un geste qui verrouille la société, pas
    // le contrôle de clé étrangère d'une adresse créée sans verrou.
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${company.id} FOR NO KEY UPDATE`;
    taken();
    await held;
  });
  await lockTaken;

  let saved = false;
  const saving = addresses.saveBilling(company.id, BILLING).then(() => {
    saved = true;
  });
  await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
  expect(saved).toBe(false);

  release();
  await holder;
  await saving;
  const billings = await ctx.prisma.address.findMany({
    where: { companyId: company.id, kind: AddressKind.billing, archivedAt: null },
  });
  expect(billings).toHaveLength(1);
});
