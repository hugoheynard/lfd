/**
 * E2E du **registre des contextes de vente** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : que le contexte racine **réapparaît** après
 * une suppression directe en base, et que la surface d'administration rend
 * aussi les contextes hors service — les deux touchent la base, pas le domaine.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SalesContextRegistry } from "../src/pim/sales-contexts/domain/ports/sales-context.registry.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CONTEXTS = "/pim/sales-contexts";

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
  readonly active: boolean;
  readonly shopifyProjected: boolean;
  readonly handleSuffix: string;
  readonly position: number;
  readonly root: boolean;
  readonly offeredByLocations: number;
  readonly soldBy: number;
  readonly ratedBy: number;
}

const NEW_CONTEXT = {
  key: "traiteur",
  label: "Traiteur",
  handleSuffix: "-traiteur",
  active: true,
  shopifyProjected: false,
};

const rowOf = async (key: string): Promise<ContextRow | undefined> =>
  (await list()).find((row) => row.key === key);

const list = async (): Promise<ContextRow[]> =>
  jsonBody<ContextRow[]>(await staff().get(CONTEXTS).expect(200));

const registry = (): SalesContextRegistry => ctx.app.get(SalesContextRegistry);

describe("la surface d'administration montre le registre entier", () => {
  it("rend les trois contextes, dans l'ordre du registre", async () => {
    expect((await list()).map((row) => row.key)).toEqual(["takeaway", "eatIn", "b2b"]);
  });

  /**
   * `GET /sales-contexts/active` ne rend que les contextes EN SERVICE — il
   * dessine la matrice, et une colonne qu'on ne peut pas vendre n'y a rien à
   * faire. L'administration, elle, doit voir ce qui est éteint : sinon un
   * contexte désactivé disparaît de l'écran qui sert à le rallumer.
   */
  it("rend AUSSI les contextes hors service, que la matrice ignore", async () => {
    await ctx.prisma.salesContext.update({
      where: { key: "eatIn" },
      data: { active: false },
    });

    const rows = await list();
    expect(rows.map((row) => row.key)).toContain("eatIn");
    expect(rows.find((row) => row.key === "eatIn")?.active).toBe(false);

    const matrix = jsonBody<{ key: string }[]>(
      await staff().get("/pim/sales-contexts/active").expect(200),
    );
    expect(matrix.map((row) => row.key)).not.toContain("eatIn");
  });

  it("désigne le B2B comme racine, et lui seul", async () => {
    const rows = await list();

    expect(rows.filter((row) => row.root).map((row) => row.key)).toEqual(["b2b"]);
  });

  /**
   * Le B2B est offert par la PLATEFORME, qui n'est pas un emplacement. Le
   * compte se lisait sur `location_context`, qui ne la connaît pas : l'écran
   * annonçait « 0 » puis la suppression échouait sur une clé étrangère.
   */
  it("compte la plateforme parmi les points de vente qui offrent le B2B", async () => {
    const b2b = (await list()).find((row) => row.key === "b2b");

    expect(b2b?.offeredByLocations).toBe(1);
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
    // L'offre d'abord : depuis p-0, la plateforme professionnelle OFFRE le
    // contexte racine, et cette clé étrangère est en `Restrict` — même une
    // suppression directe en base ne passe pas par-dessus. C'est le mur qu'on
    // voulait ; on le contourne ici pour éprouver la garde qui vient APRÈS.
    // Le `reset` de la suite suivante resème la paire.
    await ctx.prisma.pointOfSaleContext.deleteMany({ where: { contextKey: "b2b" } });
    await ctx.prisma.salesContext.delete({ where: { key: "b2b" } });
    expect((await list()).map((row) => row.key)).not.toContain("b2b");

    await registry().ensureRootContext();

    const root = (await list()).find((row) => row.key === "b2b");
    expect(root).toMatchObject({ key: "b2b", root: true, active: true });
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

/**
 * **La promesse de C0, jusqu'au bout.**
 *
 * « Ajouter un contexte de vente = une ligne, zéro code » s'arrêtait au bord de
 * l'écran : la ligne existait, et le registre l'écartait en silence faute de
 * figurer dans une liste écrite en dur. Ce verrou est tombé avec C0-d ; ces cas
 * vérifient que la porte qui va avec tient ses invariants.
 */
describe("ouvrir un contexte de vente", () => {
  it("le rend visible, en fin de registre", async () => {
    await staff().post(CONTEXTS).send(NEW_CONTEXT).expect(201);

    const rows = await list();
    expect(rows.map((row) => row.key)).toEqual(["takeaway", "eatIn", "b2b", "traiteur"]);
    expect(rows.at(-1)).toMatchObject({ key: "traiteur", label: "Traiteur", root: false });
  });

  it("refuse une clé déjà prise", async () => {
    const response = await staff()
      .post(CONTEXTS)
      .send({ ...NEW_CONTEXT, key: "b2b" });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("catalogue.sales_context.key_taken");
  });

  it("refuse une clé qui n'est pas une identité", async () => {
    // La clé est citée par trois clés étrangères et voyage dans les taux. Un
    // espace ou un accent en ferait deux identités pour un seul contexte.
    const response = await staff()
      .post(CONTEXTS)
      .send({ ...NEW_CONTEXT, key: "à emporter" });

    expect(response.status).toBe(400);
  });

  /**
   * Deux contextes PROJETÉS ne peuvent pas partager un suffixe : ils
   * produiraient la même URL de produit. Le vide est celui du contexte par
   * défaut — le handle nu, qui protège les URL indexées.
   */
  it("refuse un suffixe de handle déjà projeté", async () => {
    const response = await staff()
      .post(CONTEXTS)
      .send({ ...NEW_CONTEXT, shopifyProjected: true, handleSuffix: "" });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("catalogue.sales_context.handle_taken");
  });

  it("laisse deux contextes NON projetés partager un suffixe vide", async () => {
    // Un contexte qui n'a pas de handle ne collisionne avec rien ; exiger
    // l'unicité interdirait le vide à tous sauf un.
    await staff()
      .post(CONTEXTS)
      .send({ ...NEW_CONTEXT, handleSuffix: "" })
      .expect(201);
  });
});

describe("régler un contexte de vente", () => {
  it("change ce qui est réglable", async () => {
    await staff().post(CONTEXTS).send(NEW_CONTEXT).expect(201);

    await staff()
      .put(`${CONTEXTS}/traiteur`)
      .send({ ...NEW_CONTEXT, label: "Service traiteur", position: 9, active: false })
      .expect(200);

    expect(await rowOf("traiteur")).toMatchObject({
      label: "Service traiteur",
      active: false,
    });
  });

  it("laisse RÉGLER la racine — ineffaçable ne veut pas dire immuable", async () => {
    await staff()
      .put(`${CONTEXTS}/b2b`)
      .send({
        label: "Professionnels",
        handleSuffix: "",
        active: false,
        shopifyProjected: false,
        position: 3,
      })
      .expect(200);

    expect(await rowOf("b2b")).toMatchObject({ label: "Professionnels", active: false });
  });
});

/**
 * Ouvre une boutique qui OFFRE un contexte donné, en base directe.
 *
 * Directe pour rester au plus près de ce qu'on éprouve ici — le mur de la clé
 * étrangère — sans faire dépendre cette suite de la route des points de vente.
 */
async function openShopOffering(contextKey: string): Promise<void> {
  await ctx.prisma.pointOfSale.create({
    data: {
      id: "emp_test",
      kind: "shop",
      label: "Village",
      baseUrl: "",
      contexts: { create: [{ contextKey }] },
    },
  });
}

describe("effacer un contexte de vente", () => {
  it("efface celui que rien ne retient", async () => {
    await staff().post(CONTEXTS).send(NEW_CONTEXT).expect(201);

    await staff().delete(`${CONTEXTS}/traiteur`).expect(200);

    expect(await rowOf("traiteur")).toBeUndefined();
  });

  it("REFUSE la racine", async () => {
    const response = await staff().delete(`${CONTEXTS}/b2b`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "catalogue.sales_context.root_protected",
    );
    expect(await rowOf("b2b")).toBeDefined();
  });

  /**
   * Le mur est une clé étrangère, pas une lecture : entre un compte et la
   * suppression, une grille peut se mettre à vendre le contexte.
   */
  it("REFUSE celui qu'un point de vente offre encore", async () => {
    await staff().post(CONTEXTS).send(NEW_CONTEXT).expect(201);
    await openShopOffering("traiteur");

    const response = await staff().delete(`${CONTEXTS}/traiteur`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("catalogue.sales_context.in_use");
  });

  it("dit ce qui retient chaque contexte, AVANT le geste", async () => {
    await staff().post(CONTEXTS).send(NEW_CONTEXT).expect(201);
    await openShopOffering("traiteur");

    expect(await rowOf("traiteur")).toMatchObject({ offeredByLocations: 1, soldBy: 0 });
  });
});
