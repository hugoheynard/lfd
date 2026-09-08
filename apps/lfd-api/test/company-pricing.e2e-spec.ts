/**
 * E2E de **la tarification d'un client** — l'onglet « Tarifs » de sa fiche.
 *
 * Quatre choses que seul ce niveau prouve, et qui sont exactement celles qui
 * feraient annoncer un mauvais prix au téléphone :
 *
 * 1. la lecture est **filtrée par audience** — la mercuriale d'un autre client
 *    n'apparaît pas, et surtout ne gagne pas l'étage ;
 * 2. le prix rendu est celui que la **caisse** calculerait, parce qu'il passe
 *    par la même composition ;
 * 3. poser refuse tant qu'une mercuriale couvre la période, et le refus la
 *    **nomme** — c'est ce qui rend praticable « on clôt d'abord » ;
 * 4. une pose refusée à mi-parcours **n'écrit rien**, là où celle d'un gabarit
 *    laisse le client à moitié tarifé.
 */
import type { CompanyPricingView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

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

const staff = () => ctx.asSub("staff-e2e");

/** VIE-001 vaut 200 c dans le catalogue qui facture. */
const SKU = "VIE-001";
const OTHER_SKU = "VIE-002";
const CANONICAL_MILLICENTS = 200_000;
/** Le prix négocié de référence de cette suite. */
const NEGOTIATED_MILLICENTS = 150_000;

/**
 * ⚠️ Les fenêtres de ce fichier sont **absolues**, et c'est l'exception écrite
 * du dépôt : elles ne sont comparées qu'entre elles — adjacence, chevauchement,
 * refus. Les deux seuls cas dont le résultat dépend de l'horloge (« en vigueur »,
 * « à venir ») prennent, eux, des dates relatives.
 */
const FROM = "2026-01-01T00:00:00.000Z";
const TO = "2026-12-31T00:00:00.000Z";

function relative(days: number): string {
  const at = new Date();
  at.setUTCHours(0, 0, 0, 0);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString();
}

/** Pose la mercuriale de référence sur ce compte. */
const poseOn = (companyId: string) =>
  pose(companyId, { lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }] }).expect(
    201,
  );

const read = async (companyId: string): Promise<CompanyPricingView> =>
  jsonBody<CompanyPricingView>(
    await staff().get(`/admin/pricing/companies/${companyId}`).expect(200),
  );

const pose = (companyId: string, body: Record<string, unknown>) =>
  staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale Club Med",
      validFrom: FROM,
      validTo: TO,
      ...body,
    });

/** L'article du tableau, quel que soit le rayon où il est rangé. */
function itemOf(view: CompanyPricingView, sku: string) {
  return view.categories.flatMap((category) => category.items).find((item) => item.sku === sku);
}

describe("la lecture d'un dossier", () => {
  it("refuse une société inconnue plutôt que de rendre le tarif de liste", async () => {
    // 🔴 Le cas qui justifie le contrôle : une société inconnue ne filtre RIEN,
    // donc la lecture rendrait un écran parfaitement plausible affirmant « ce
    // client paie le tarif public ». Rien ne distinguerait ce mensonge d'une
    // vérité, sauf ce refus.
    await staff().get("/admin/pricing/companies/co_inexistante").expect(404);
  });

  it("rend le tarif catalogue quand le client n'a rien de négocié", async () => {
    const company = await createCompany(ctx.prisma);

    const view = await read(company.id);

    expect(itemOf(view, SKU)).toMatchObject({
      canonicalMillicents: CANONICAL_MILLICENTS,
      finalMillicents: CANONICAL_MILLICENTS,
      sealedByRuleId: null,
    });
    expect(view.mercuriales).toEqual([]);
    expect(view.negotiatedSkuCount).toBe(0);
    // `null` et non zéro : une moyenne sur rien se lirait « il paie le tarif »,
    // alors qu'il n'a pas de tarif négocié du tout.
    expect(view.averageGapBp).toBeNull();
  });

  it("applique la mercuriale du client, et compte l'écart au catalogue", async () => {
    const company = await createCompany(ctx.prisma);
    await pose(company.id, {
      lines: [{ sku: SKU, unitPriceMillicents: 150_000 }],
    }).expect(201);

    const view = await read(company.id);

    const item = itemOf(view, SKU);
    expect(item?.finalMillicents).toBe(150_000);
    expect(item?.sealedByRuleId).not.toBeNull();
    expect(view.negotiatedSkuCount).toBe(1);
    // 200 000 → 150 000, soit 25 % de moins : 2 500 points de base.
    expect(view.averageGapBp).toBe(2_500);
  });

  it("🔴 ne montre PAS la mercuriale d'un autre client, et ne la laisse pas gagner", async () => {
    // Le défaut que ce filtre existe pour empêcher. Le tableau général liste
    // toutes les règles d'un article, audiences confondues ; sur un dossier
    // client, chaque ligne affirme « voici ce qui s'applique à LUI ».
    const mine = await createCompany(ctx.prisma);
    const theirs = await createCompany(ctx.prisma);
    await pose(theirs.id, { lines: [{ sku: SKU, unitPriceMillicents: 50_000 }] }).expect(201);

    const view = await read(mine.id);

    const item = itemOf(view, SKU);
    expect(item?.finalMillicents).toBe(CANONICAL_MILLICENTS);
    expect(item?.sealedByRuleId).toBeNull();
    expect(item?.rules).toEqual([]);
    expect(view.mercuriales).toEqual([]);
  });
});

describe("les mercuriales du dossier", () => {
  it("recolle les règles en UNE mercuriale, et compte ses articles", async () => {
    const company = await createCompany(ctx.prisma);
    await pose(company.id, {
      lines: [
        { sku: SKU, unitPriceMillicents: 150_000 },
        { sku: OTHER_SKU, unitPriceMillicents: 160_000 },
      ],
    }).expect(201);

    const view = await read(company.id);

    expect(view.mercuriales).toHaveLength(1);
    expect(view.mercuriales[0]).toMatchObject({
      label: "Mercuriale Club Med",
      ruleCount: 2,
      skuCount: 2,
    });
  });

  it("dit « à venir » d'une fenêtre qui n'a pas commencé", async () => {
    const company = await createCompany(ctx.prisma);
    await pose(company.id, {
      validFrom: relative(30),
      validTo: relative(400),
      lines: [{ sku: SKU, unitPriceMillicents: 150_000 }],
    }).expect(201);

    const view = await read(company.id);

    expect(view.mercuriales[0]?.status).toBe("scheduled");
    // Et elle ne change AUCUN prix aujourd'hui : c'est tout l'intérêt de la
    // distinction. Annoncer « en vigueur » ferait chercher un prix que la
    // caisse n'applique pas.
    expect(itemOf(view, SKU)?.finalMillicents).toBe(CANONICAL_MILLICENTS);
  });
});

describe("poser", () => {
  it("écrit une règle par ligne, au seuil 1 — pas de palier", async () => {
    const company = await createCompany(ctx.prisma);

    const posed = jsonBody<{ affectedRules: number }>(
      await pose(company.id, {
        lines: [
          { sku: SKU, unitPriceMillicents: 150_000 },
          { sku: OTHER_SKU, unitPriceMillicents: 160_000 },
        ],
      }).expect(201),
    );

    expect(posed.affectedRules).toBe(2);
    const rows = await ctx.prisma.priceRule.findMany({
      where: { audienceId: company.id, stage: "mercuriale" },
      select: { minQuantity: true, amountMillicents: true },
    });
    expect(rows.every((row) => row.minQuantity === 1)).toBe(true);
  });

  it("refuse une fenêtre sans terme — c'est une tarification datée", async () => {
    const company = await createCompany(ctx.prisma);

    await staff()
      .post(`/admin/pricing/companies/${company.id}/mercuriale`)
      .send({
        label: "Sans fin",
        validFrom: FROM,
        validTo: null,
        lines: [{ sku: SKU, unitPriceMillicents: 150_000 }],
      })
      .expect(400);
  });

  it("refuse quand une mercuriale couvre déjà la période, en la NOMMANT", async () => {
    const company = await createCompany(ctx.prisma);
    await pose(company.id, { lines: [{ sku: SKU, unitPriceMillicents: 150_000 }] }).expect(201);

    const refused = await pose(company.id, {
      label: "Renégociation",
      lines: [{ sku: SKU, unitPriceMillicents: 140_000 }],
    }).expect(409);

    // Le nom, parce que la sortie demande de la clore — et qu'on ne clôt pas ce
    // qu'on ne sait pas désigner.
    expect(JSON.stringify(refused.body)).toContain("Mercuriale Club Med");
  });

  it("🔴 n'écrit RIEN quand une seule ligne de la grille est refusée", async () => {
    // Le défaut que la transaction ferme. La pose d'un gabarit, elle, écrit une
    // par une hors transaction : elle laisse posées les lignes d'avant celle qui
    // échoue, et le client se retrouve à moitié tarifé sans que personne ne
    // l'ait décidé.
    const company = await createCompany(ctx.prisma);
    await pose(company.id, {
      label: "Déjà là",
      lines: [{ sku: OTHER_SKU, unitPriceMillicents: 190_000 }],
    }).expect(201);

    await pose(company.id, {
      label: "La suivante",
      lines: [
        { sku: SKU, unitPriceMillicents: 150_000 },
        { sku: OTHER_SKU, unitPriceMillicents: 140_000 },
      ],
    }).expect(409);

    const posed = await ctx.prisma.priceRule.findMany({
      where: { audienceId: company.id, label: "La suivante" },
    });
    expect(posed).toEqual([]);
  });

  it("laisse poser sur la période qui SUIT, la borne haute étant exclue", async () => {
    // Deux fenêtres qui se succèdent à la même date ne se chevauchent pas :
    // c'est la convention du contexte, et elle évite d'avoir à clore une
    // mercuriale pour lui donner une suite.
    const company = await createCompany(ctx.prisma);
    await pose(company.id, { lines: [{ sku: SKU, unitPriceMillicents: 150_000 }] }).expect(201);

    await pose(company.id, {
      label: "L'an prochain",
      validFrom: TO,
      validTo: "2027-12-31T00:00:00.000Z",
      lines: [{ sku: SKU, unitPriceMillicents: 140_000 }],
    }).expect(201);
  });
});

describe("clore", () => {
  const close = (companyId: string, body: Record<string, unknown> = {}) =>
    staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/close`)
      .send({ label: "Mercuriale Club Med", validFrom: FROM, validTo: TO, ...body });

  it("archive ses règles, et rend la place pour en poser une autre", async () => {
    const company = await createCompany(ctx.prisma);
    await pose(company.id, { lines: [{ sku: SKU, unitPriceMillicents: 150_000 }] }).expect(201);

    const closed = jsonBody<{ affectedRules: number }>(
      await close(company.id, { reason: "Renégociée" }).expect(200),
    );

    expect(closed.affectedRules).toBe(1);
    // Archivée, jamais effacée : la ligne reste, avec son motif.
    const rows = await ctx.prisma.priceRule.findMany({
      where: { audienceId: company.id },
      select: { archivedAt: true, archiveReason: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.archivedAt).not.toBeNull();
    expect(rows[0]?.archiveReason).toBe("Renégociée");

    // Et la place est rendue — c'est le point de la clôture.
    await pose(company.id, {
      label: "Renégociation",
      lines: [{ sku: SKU, unitPriceMillicents: 140_000 }],
    }).expect(201);
  });

  it("disparaît du dossier une fois close, et le prix revient au catalogue", async () => {
    const company = await createCompany(ctx.prisma);
    await pose(company.id, { lines: [{ sku: SKU, unitPriceMillicents: 150_000 }] }).expect(201);
    await close(company.id).expect(200);

    const view = await read(company.id);

    expect(view.mercuriales).toEqual([]);
    expect(itemOf(view, SKU)?.finalMillicents).toBe(CANONICAL_MILLICENTS);
  });

  it("répond 404 quand rien ne correspond à cette clé", async () => {
    // Deux personnes peuvent avoir le même écran ouvert : celle qui arrive
    // seconde mérite de savoir que son geste n'a rien fait.
    const company = await createCompany(ctx.prisma);

    await close(company.id, { label: "Jamais posée" }).expect(404);
  });
});

/**
 * **Renommer une mercuriale.**
 *
 * Le geste a l'air anodin et ne l'est pas : le libellé est la MOITIÉ de la clé
 * qui recolle les règles en une mercuriale. Ce que ces cas tiennent est
 * exactement ce que cette absence d'identité rend fragile — l'atomicité du
 * renommage, et l'homonymie qui ferait fusionner deux négociations en une.
 */
describe("renommer", () => {
  const rename = (companyId: string, body: Record<string, unknown> = {}) =>
    staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/rename`)
      .send({
        label: "Mercuriale Club Med",
        validFrom: FROM,
        validTo: TO,
        newLabel: "Mercuriale 2026",
        ...body,
      });

  it("change le nom SANS toucher aux prix", async () => {
    // Le libellé n'entre dans aucune résolution : ce test le prouve plutôt que
    // de le supposer, parce que c'est la promesse faite au commercial qui
    // renomme un tarif déjà en vigueur chez un client.
    const company = await createCompany(ctx.prisma);
    await poseOn(company.id);

    const renamed = jsonBody<{ affectedRules: number }>(await rename(company.id).expect(200));

    expect(renamed.affectedRules).toBe(1);
    const view = await read(company.id);
    expect(view.mercuriales).toHaveLength(1);
    expect(view.mercuriales[0]?.label).toBe("Mercuriale 2026");
    expect(itemOf(view, SKU)?.finalMillicents).toBe(NEGOTIATED_MILLICENTS);
  });

  it("🔴 renomme TOUTES ses règles, jamais une partie", async () => {
    // Le cas qui justifie la transaction : une mercuriale à moitié renommée se
    // couperait en DEUX lignes à la lecture suivante — deux grilles partielles,
    // et aucune façon de les recoller.
    const company = await createCompany(ctx.prisma);
    await pose(company.id, {
      lines: [
        { sku: SKU, unitPriceMillicents: 150_000 },
        { sku: OTHER_SKU, unitPriceMillicents: 120_000 },
      ],
    }).expect(201);

    await rename(company.id).expect(200);

    const view = await read(company.id);
    expect(view.mercuriales).toHaveLength(1);
    expect(view.mercuriales[0]?.lines).toHaveLength(2);
  });

  it("🔴 refuse un nom déjà pris sur la même fenêtre", async () => {
    // Sans ce refus, les deux mercuriales fusionneraient à la lecture suivante
    // en une seule ligne, et rien ne permettrait de les redistinguer : ce qui
    // les distinguait était précisément le nom.
    const company = await createCompany(ctx.prisma);
    await pose(company.id, { lines: [{ sku: SKU, unitPriceMillicents: 150_000 }] }).expect(201);
    await pose(company.id, {
      label: "Mercuriale 2026",
      lines: [{ sku: OTHER_SKU, unitPriceMillicents: 120_000 }],
    }).expect(201);

    await rename(company.id).expect(409);

    const view = await read(company.id);
    expect(view.mercuriales.map((entry) => entry.label).sort()).toEqual([
      "Mercuriale 2026",
      "Mercuriale Club Med",
    ]);
  });

  it("accepte de renommer en son propre nom", async () => {
    // Corriger une faute de frappe sans en faire une reprend le même nom : le
    // contrôle d'homonymie se heurterait aux règles qu'on renomme, et refuserait
    // un geste qui ne change rien.
    const company = await createCompany(ctx.prisma);
    await poseOn(company.id);

    await rename(company.id, { newLabel: "Mercuriale Club Med" }).expect(200);
  });

  it("répond 404 quand rien ne correspond à cette clé", async () => {
    const company = await createCompany(ctx.prisma);

    await rename(company.id, { label: "Jamais posée" }).expect(404);
  });

  it("🔴 ne touche pas la mercuriale d'un AUTRE client de même nom", async () => {
    // Le mur d'audience vaut aussi pour les gestes, pas seulement pour la
    // lecture : deux clients portent couramment le même nom de grille.
    const mine = await createCompany(ctx.prisma);
    const theirs = await createCompany(ctx.prisma);
    await poseOn(mine.id);
    await poseOn(theirs.id);

    await rename(mine.id).expect(200);

    const view = await read(theirs.id);
    expect(view.mercuriales[0]?.label).toBe("Mercuriale Club Med");
  });
});

/**
 * **Le brouillon de mercuriale** — une négociation qu'on reprend.
 *
 * Ce qu'il ne fait pas est aussi important que ce qu'il fait : il ne tarife
 * rien. Un brouillon posé sur un compte ne change aucun prix, et c'est ce qui
 * autorise à l'enregistrer incomplet.
 */
describe("le brouillon", () => {
  const draft = (companyId: string) => `/admin/pricing/companies/${companyId}/mercuriale/draft`;

  it("répond `null` quand il n'y en a pas — pas un 404", async () => {
    // « Ce compte n'a pas de négociation ouverte » est une réponse, pas une
    // absence de ressource. Un 404 obligerait l'écran à traiter le cas normal
    // comme une erreur.
    const company = await createCompany(ctx.prisma);

    const body = jsonBody<{ draft: unknown }>(await staff().get(draft(company.id)).expect(200));
    expect(body.draft).toBeNull();
  });

  it("s'enregistre INCOMPLET — c'est sa raison d'être", async () => {
    // On écrit les prix avant de dater, on date avant de nommer. Refuser une
    // grille sans bornes ferait du brouillon une pose au rabais.
    const company = await createCompany(ctx.prisma);

    await staff()
      .put(draft(company.id))
      .send({ label: "", validFrom: null, validTo: null, lines: [] })
      .expect(204);

    const { draft: saved } = jsonBody<{ draft: { label: string; lines: unknown[] } }>(
      await staff().get(draft(company.id)).expect(200),
    );
    expect(saved.lines).toEqual([]);
  });

  it("se remplace, il ne s'accumule pas", async () => {
    const company = await createCompany(ctx.prisma);
    const save = (label: string, price: number) =>
      staff()
        .put(draft(company.id))
        .send({
          label,
          validFrom: FROM,
          validTo: TO,
          lines: [{ sku: SKU, unitPriceMillicents: price }],
        })
        .expect(204);

    await save("Premier jet", 180_000);
    await save("Deuxième jet", 170_000);

    const { draft: saved } = jsonBody<{
      draft: { label: string; lines: { unitPriceMillicents: number }[] };
    }>(await staff().get(draft(company.id)).expect(200));
    expect(saved.label).toBe("Deuxième jet");
    expect(saved.lines).toEqual([{ sku: SKU, unitPriceMillicents: 170_000 }]);
  });

  it("🔴 ne tarife RIEN : un brouillon ne change aucun prix", async () => {
    const company = await createCompany(ctx.prisma);
    await staff()
      .put(draft(company.id))
      .send({
        label: "Jamais posée",
        validFrom: FROM,
        validTo: TO,
        lines: [{ sku: SKU, unitPriceMillicents: 10_000 }],
      })
      .expect(204);

    const view = await read(company.id);

    expect(itemOf(view, SKU)?.finalMillicents).toBe(CANONICAL_MILLICENTS);
    expect(view.mercuriales).toEqual([]);
  });

  it("est JETÉ par la pose — il est devenu une décision", async () => {
    // Le garder ferait rouvrir l'écran sur une négociation déjà close, et la
    // prochaine sauvegarde écraserait sans qu'on sache laquelle fait foi.
    const company = await createCompany(ctx.prisma);
    await staff()
      .put(draft(company.id))
      .send({
        label: "Mercuriale Club Med",
        validFrom: FROM,
        validTo: TO,
        lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
      })
      .expect(204);

    await pose(company.id, {
      lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
    }).expect(201);

    const body = jsonBody<{ draft: unknown }>(await staff().get(draft(company.id)).expect(200));
    expect(body.draft).toBeNull();
  });

  it("se jette à la demande, et le geste est SILENCIEUX s'il n'y en a pas", async () => {
    // L'état visé — « plus de brouillon sur ce compte » — est atteint dans les
    // deux cas. C'est ce qui rend le geste sûr à répéter.
    const company = await createCompany(ctx.prisma);

    await staff().delete(draft(company.id)).expect(204);
    await staff().delete(draft(company.id)).expect(204);
  });
});

describe("qui a établi la mercuriale", () => {
  it("remonte l'auteur avec la mercuriale, sans ouvrir le journal", async () => {
    // Sur un tarif négocié, la question posée six mois plus tard est toujours
    // « qui a accordé ça ».
    const company = await createCompany(ctx.prisma);
    await poseOn(company.id);

    const view = await read(company.id);

    expect(view.mercuriales[0]?.createdBy).toBe("staff-e2e");
  });
});
