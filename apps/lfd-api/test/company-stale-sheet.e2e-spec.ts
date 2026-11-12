/**
 * E2E de la **fiche périmée** (`comptes-client/plan-fiche-perimee.md`) : un
 * geste du back-office décidé sur une fiche lue à une révision dépassée est
 * refusé (409) au lieu d'écraser, et un rejeu à l'identique n'en est pas un.
 *
 * Seul l'e2e prouve la chaîne entière : la révision servie par la vraie
 * lecture, l'en-tête lu par le contrôleur, et le `WHERE revision` du dépôt
 * sur la vraie ligne.
 */
import { CompanyChangedSinceReadError } from "../src/lafoliecoffee/account/domain/errors/account-errors.js";
import { CompanyRepository } from "../src/lafoliecoffee/account/domain/ports/company.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

const STALE_CODE = "account.company.changed_since_read";

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const company = await createCompany(ctx.prisma, {
    status: CompanyStatus.pending,
    siret: "73282932000009",
  });
  companyId = company.id;
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** La révision que la fiche staff sert — celle que l'écran renvoie. */
async function readRevision(): Promise<number> {
  const response = await staff().get(`/admin/companies/${companyId}`).expect(200);
  const body = response.body as { readonly revision: number };
  return body.revision;
}

const ifMatch = (revision: number): string => `"${revision}"`;

describe("la fiche périmée", () => {
  it("la fiche servie porte sa révision, et chaque enregistrement la monte", async () => {
    const read = await readRevision();

    await staff()
      .patch(`/admin/companies/${companyId}/identity`)
      .set("If-Match", ifMatch(read))
      .send({ enseigne: "Le Comptoir" })
      .expect(204);

    expect(await readRevision()).toBe(read + 1);
  });

  it("deux écritures sur la même révision lue : la seconde est refusée (409), sans rien écrire", async () => {
    const read = await readRevision();

    await staff()
      .patch(`/admin/companies/${companyId}/identity`)
      .set("If-Match", ifMatch(read))
      .send({ enseigne: "Le Comptoir" })
      .expect(204);
    const refused = await staff()
      .patch(`/admin/companies/${companyId}/granted-terms`)
      .set("If-Match", ifMatch(read))
      .send({ grantedTerms: ["monthly"] })
      .expect(409);

    expect(refused.body).toMatchObject({ code: STALE_CODE });
    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(row.enseigne).toBe("Le Comptoir");
    expect(row.grantedTerms).toEqual([]);
    expect(row.revision).toBe(read + 1);
  });

  it("le détenteur aussi : une fiche lue avant une autre écriture est refusée", async () => {
    const read = await readRevision();
    await staff()
      .patch(`/admin/companies/${companyId}/granted-terms`)
      .set("If-Match", ifMatch(read))
      .send({ grantedTerms: ["monthly"] })
      .expect(204);

    const refused = await staff()
      .patch(`/admin/companies/${companyId}/contact`)
      .set("If-Match", ifMatch(read))
      .send({ firstName: "Karim", lastName: "Rousseau", email: "karim@comptoir.fr" })
      .expect(409);

    expect(refused.body).toMatchObject({ code: STALE_CODE });
  });

  it("rejouer la même intention (même corps, même révision lue) n'est pas un conflit", async () => {
    const read = await readRevision();
    const send = () =>
      staff()
        .patch(`/admin/companies/${companyId}/granted-terms`)
        .set("If-Match", ifMatch(read))
        .send({ grantedTerms: ["monthly"] });

    await send().expect(204);
    await send().expect(204);

    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(row.revision).toBe(read + 1);
  });

  it("sans If-Match, rien n'est comparé : l'appelant qui n'a pas lu de fiche écrit", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/identity`)
      .send({ enseigne: "Le Comptoir" })
      .expect(204);
    await staff()
      .patch(`/admin/companies/${companyId}/fulfillment-preference`)
      .send({ method: "pickup" })
      .expect(204);
  });

  it("un If-Match qui ne dit pas une révision est refusé (400)", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/identity`)
      .set("If-Match", "*")
      .send({ enseigne: "Le Comptoir" })
      .expect(400);
  });

  it("deux gestes chargés sur la même fiche lue : le second à écrire est refusé par la base", async () => {
    // La course que la vérification de l'agrégat ne voit pas : les deux ont
    // chargé la révision lue, avant que l'un ou l'autre écrive.
    const companies = ctx.app.get(CompanyRepository);
    const read = await readRevision();
    const first = await companies.load(companyId);
    const second = await companies.load(companyId);
    if (first === null || second === null) {
      throw new Error("société semée introuvable");
    }
    first.grantTerms(["monthly"]);
    first.ensureReadAt(read);
    second.editSoftIdentity({ enseigne: "Le Comptoir", vatNumber: "" });
    second.ensureReadAt(read);

    await companies.save(first);
    await expect(companies.save(second)).rejects.toBeInstanceOf(CompanyChangedSinceReadError);

    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(row.grantedTerms).toEqual(["monthly"]);
    expect(row.enseigne).not.toBe("Le Comptoir");
    expect(row.revision).toBe(read + 1);
  });
});
