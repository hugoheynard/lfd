/**
 * E2E de la **porte pro** : `POST /me/establishment`, profil et société d'un
 * même geste, contre le vrai Postgres.
 *
 * Ce qu'aucun test unitaire ne peut prouver, et que cette suite tient :
 * l'atomicité réelle (la société entre dans la transaction du profil par
 * `transactionalPrisma`), et le verrou consultatif qui fait qu'un double clic
 * n'ouvre qu'une seule société.
 *
 * Le fournisseur d'identité n'est pas doublé : la route n'a pas à l'appeler,
 * et un double qui enregistrerait zéro appel ne prouverait rien de plus.
 */
import type { DeclaredEstablishmentResponse } from "../src/b2b/account/http/me.controller.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const SUB = "auth0|porte-pro";
const ACCOUNT_EMAIL = "camille@pqmarais.fr";

const DECLARATION = {
  firstName: "Camille",
  lastName: "Rousseau",
  phone: "01 42 71 08 44",
  enseigne: "Le Pain Quotidien du Marais",
};

let ctx: E2eContext;
let userId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Un compte tel que le provisionnement au vol le laisse : son adresse, rien d'autre.
  const user = await createUser(ctx.prisma, {
    auth0Sub: SUB,
    email: ACCOUNT_EMAIL,
    firstName: "",
    lastName: "",
    phone: "",
    emailVerified: true,
  });
  userId = user.id;
});

/** Les sociétés auxquelles la personne est rattachée, rattachements compris. */
function companiesOfUser() {
  return ctx.prisma.company.findMany({
    where: { memberships: { some: { userId } } },
    include: { memberships: true },
  });
}

describe("POST /me/establishment", () => {
  it("écrit le profil ET la société pending dont la personne est détentrice", async () => {
    const response = await ctx.asSub(SUB).post("/me/establishment").send(DECLARATION).expect(201);
    const { companyId } = jsonBody<DeclaredEstablishmentResponse>(response);

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored).toMatchObject({
      firstName: "Camille",
      lastName: "Rousseau",
      phone: "01 42 71 08 44",
      // L'adresse reste celle du compte, et sa preuve avec elle.
      email: ACCOUNT_EMAIL,
      emailVerified: true,
    });

    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { memberships: true },
    });
    expect(company.status).toBe(CompanyStatus.pending);
    expect(company).toMatchObject({
      enseigne: "Le Pain Quotidien du Marais",
      contactPrenom: "Camille",
      contactNom: "Rousseau",
    });
    expect(company.memberships).toEqual([
      expect.objectContaining({ userId, role: CustomerRole.owner }),
    ]);
  });

  it("n'écrit RIEN quand un champ est refusé", async () => {
    const sansNom = await ctx
      .asSub(SUB)
      .post("/me/establishment")
      .send({ ...DECLARATION, lastName: "   " });
    const sansEnseigne = await ctx
      .asSub(SUB)
      .post("/me/establishment")
      .send({ ...DECLARATION, enseigne: "" });

    expect([sansNom.status, sansEnseigne.status]).toEqual([400, 400]);
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored).toMatchObject({ firstName: "", lastName: "" });
    await expect(companiesOfUser()).resolves.toEqual([]);
  });

  it("refuse un second appel en 409, sans seconde société", async () => {
    await ctx.asSub(SUB).post("/me/establishment").send(DECLARATION).expect(201);

    const again = await ctx
      .asSub(SUB)
      .post("/me/establishment")
      .send({ ...DECLARATION, enseigne: "Un autre nom" });

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      message: "Votre compte est déjà rattaché à un établissement.",
    });
    await expect(companiesOfUser()).resolves.toHaveLength(1);
  });

  it("refuse aussi l'employé invité, qui n'a rien déclaré lui-même", async () => {
    const employer = await createCompany(ctx.prisma);
    await attachTo(ctx.prisma, userId, employer.id, CustomerRole.orders);

    const response = await ctx.asSub(SUB).post("/me/establishment").send(DECLARATION);

    expect(response.status).toBe(409);
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.lastName).toBe("");
  });

  it("n'ouvre qu'UNE société sous deux appels simultanés (double clic)", async () => {
    // Le verrou consultatif sérialise les deux transactions : la seconde attend
    // le commit de la première, puis voit son rattachement.
    const [first, second] = await Promise.all([
      ctx.asSub(SUB).post("/me/establishment").send(DECLARATION),
      ctx.asSub(SUB).post("/me/establishment").send(DECLARATION),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    await expect(companiesOfUser()).resolves.toHaveLength(1);
  });
});
