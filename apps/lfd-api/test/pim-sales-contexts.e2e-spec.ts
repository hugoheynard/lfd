/**
 * E2E du **registre des contextes de vente** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : que le contexte racine **réapparaît** après
 * une suppression directe en base, et que la surface d'administration rend
 * aussi les contextes hors service — les deux touchent la base, pas le domaine.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SalesContextRegistry } from "../src/pim/catalogue/shared/domain/ports/sales-context.registry.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CONTEXTS = "/pim/catalogue/sales-contexts";

let ctx: E2eContext;

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
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

interface ContextRow {
  readonly key: string;
  readonly label: string;
  readonly perLocation: boolean;
  readonly active: boolean;
  readonly root: boolean;
  readonly offeredByLocations: number;
}

const list = async (): Promise<ContextRow[]> =>
  jsonBody<ContextRow[]>(await staff().get(CONTEXTS).expect(200));

const registry = (): SalesContextRegistry => ctx.app.get(SalesContextRegistry);

describe("la surface d'administration montre le registre entier", () => {
  it("rend les trois contextes, dans l'ordre du registre", async () => {
    expect((await list()).map((row) => row.key)).toEqual(["emporter", "surPlace", "b2b"]);
  });

  /**
   * `GET /reference/sales-contexts` ne rend que les contextes EN SERVICE — il
   * dessine la matrice, et une colonne qu'on ne peut pas vendre n'y a rien à
   * faire. L'administration, elle, doit voir ce qui est éteint : sinon un
   * contexte désactivé disparaît de l'écran qui sert à le rallumer.
   */
  it("rend AUSSI les contextes hors service, que la matrice ignore", async () => {
    await ctx.prisma.salesContext.update({
      where: { key: "surPlace" },
      data: { active: false },
    });

    const rows = await list();
    expect(rows.map((row) => row.key)).toContain("surPlace");
    expect(rows.find((row) => row.key === "surPlace")?.active).toBe(false);

    const matrix = jsonBody<{ key: string }[]>(
      await staff().get("/pim/reference/sales-contexts").expect(200),
    );
    expect(matrix.map((row) => row.key)).not.toContain("surPlace");
  });

  it("désigne le B2B comme racine, et lui seul", async () => {
    const rows = await list();

    expect(rows.filter((row) => row.root).map((row) => row.key)).toEqual(["b2b"]);
  });

  it("dit lesquels ont besoin d'un lieu", async () => {
    const byKey = new Map((await list()).map((row) => [row.key, row.perLocation]));

    expect(byKey.get("emporter")).toBe(true);
    expect(byKey.get("surPlace")).toBe(true);
    // On commande à l'entreprise, pas à une boutique.
    expect(byKey.get("b2b")).toBe(false);
  });
});

describe("le contexte racine est ineffaçable", () => {
  /**
   * Le contrat exact de l'admin racine : il **réapparaît même supprimé
   * directement en base**. Sans lui, aucune TVA professionnelle ne se règle et
   * la boutique pro se vide — sans qu'une seule erreur soit levée. C'est cette
   * panne silencieuse qui justifie la garde, pas la crainte d'un clic.
   */
  it("réapparaît au boot après une suppression directe en base", async () => {
    await ctx.prisma.salesContext.delete({ where: { key: "b2b" } });
    expect((await list()).map((row) => row.key)).not.toContain("b2b");

    await registry().ensureRootContext();

    const root = (await list()).find((row) => row.key === "b2b");
    expect(root).toMatchObject({ key: "b2b", root: true, perLocation: false, active: true });
  });

  /**
   * Ineffaçable ne veut pas dire immuable. Le boot ne doit PAS repousser le
   * libellé ni l'état de service à leur valeur d'usine : fermer un canal est un
   * geste légitime, et un semis qui le rallume toutes les nuits rendrait la
   * désactivation impossible sans que rien ne l'explique.
   */
  it("ne réécrit rien quand il est déjà là", async () => {
    await ctx.prisma.salesContext.update({
      where: { key: "b2b" },
      data: { label: "Professionnels", active: false },
    });

    await registry().ensureRootContext();

    expect((await list()).find((row) => row.key === "b2b")).toMatchObject({
      label: "Professionnels",
      active: false,
    });
  });
});
