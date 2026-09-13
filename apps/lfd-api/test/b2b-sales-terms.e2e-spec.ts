/**
 * E2E des **CGV** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve :
 *
 * 1. la lecture publique aboutit **sans aucune ligne en base**, donc le
 *    dialogue de la boutique n'a pas d'instant vide ;
 * 2. le cycle complet — ajouter, relire, modifier, déplacer, retirer — survit à
 *    l'aller-retour JSONB, accents et trois langues compris ;
 * 3. les refus du domaine traversent le filtre d'erreurs avec le bon statut :
 *    **404** pour un article inconnu, **400** pour un rang hors bornes, et pas
 *    un 500 ni un 409 indifférencié.
 */
import {
  DEFAULT_SALES_TERMS,
  type SalesTermsParagraphCreated,
  type SalesTermsParagraphPayload,
  type SalesTermsView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
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
  await ctx.prisma.platformContent.deleteMany();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Un article reconnaissable à son mot-clé, dans les trois langues. */
function prose(word: string): SalesTermsParagraphPayload {
  return {
    fr: { title: `Article ${word}`, body: `Corps français — ${word} · accentué` },
    en: { title: `Clause ${word}`, body: `English body — ${word}` },
    it: { title: `Articolo ${word}`, body: `Corpo italiano — ${word}` },
  };
}

/** Ajoute un article par la route staff et rend l'identifiant frappé par le serveur. */
async function addParagraph(word: string): Promise<string> {
  const created = jsonBody<SalesTermsParagraphCreated>(
    await staff().post("/admin/content/sales-terms/paragraphs").send(prose(word)).expect(201),
  );
  return created.id;
}

const publicView = async (): Promise<SalesTermsView> =>
  jsonBody<SalesTermsView>(await ctx.http().get("/content/sales-terms").expect(200));

describe("la lecture publique des CGV", () => {
  it("aboutit sur une base VIERGE, avec le titre de départ et AUCUN article", async () => {
    const view = await publicView();

    expect(view.revision).toBe(0);
    expect(view.updatedBy).toBeNull();
    expect(view.content.title.fr).toBe(DEFAULT_SALES_TERMS.title.fr);
    // 🔴 Le repli porte le titre, jamais d'article. Servir des articles de
    // démonstration sous le titre « Conditions générales de vente » à un client
    // qui s'engage serait un faux — et le fait qu'ils avouent en être ne répare
    // rien, puisque ce qu'on lit d'abord est le titre.
    expect(view.content.paragraphs).toEqual([]);
  });

  it("n'exige aucune authentification — le dialogue s'ouvre avant toute connexion", async () => {
    await ctx.http().get("/content/sales-terms").expect(200);
  });
});

describe("l'écriture staff", () => {
  it("refuse un anonyme", async () => {
    await ctx.http().post("/admin/content/sales-terms/paragraphs").send(prose("un")).expect(401);
  });

  it("parcourt le cycle complet, et la surface publique suit", async () => {
    const first = await addParagraph("un");
    const second = await addParagraph("deux");
    const third = await addParagraph("trois");

    // Le serveur frappe des identifiants OPAQUES : rien du titre n'y transparaît.
    expect(new Set([first, second, third]).size).toBe(3);
    expect(first).not.toContain("un");

    await staff()
      .put("/admin/content/sales-terms/title")
      .send({ fr: "Nos CGV", en: "Our terms", it: "Le nostre condizioni" })
      .expect(204);

    await staff()
      .put(`/admin/content/sales-terms/paragraphs/${second}`)
      .send(prose("deux-corrigé"))
      .expect(204);

    await staff()
      .put(`/admin/content/sales-terms/paragraphs/${third}/position`)
      .send({ position: 0 })
      .expect(204);

    await staff().delete(`/admin/content/sales-terms/paragraphs/${first}`).expect(204);

    const view = await publicView();
    expect(view.content.title.it).toBe("Le nostre condizioni");
    expect(view.content.paragraphs.map((paragraph) => paragraph.id)).toEqual([third, second]);
    // L'aller-retour JSONB : l'accent et les trois langues sont revenus entiers.
    expect(view.content.paragraphs[1]?.fr.body).toBe("Corps français — deux-corrigé · accentué");
    expect(view.content.paragraphs[1]?.en.title).toBe("Clause deux-corrigé");
    expect(view.updatedBy).not.toBeNull();
    // Une révision par geste : 3 ajouts + titre + modification + déplacement + retrait.
    expect(view.revision).toBe(7);
  });

  it("l'écran d'édition voit la révision et la dernière main, que le public ignore", async () => {
    await addParagraph("un");
    const view = jsonBody<SalesTermsView>(
      await staff().get("/admin/content/sales-terms").expect(200),
    );

    expect(view.revision).toBe(1);
    expect(view.updatedBy).not.toBeNull();
  });

  it("le premier article saisi est le seul — le repli ne se persiste pas", async () => {
    const id = await addParagraph("un");
    const view = await publicView();

    expect(view.content.paragraphs.map((paragraph) => paragraph.id)).toEqual([id]);
  });

  /**
   * Régression : la lecture se repliait sur les sept articles de démonstration
   * pendant que l'écriture partait d'un document vide. L'écran d'édition
   * affichait donc des articles `demo-*` que toute action renvoyait en 404 —
   * visibles, et impossibles à corriger comme à supprimer (fix 2026-09-13).
   *
   * L'invariant : **tout article servi est un article sur lequel on peut agir.**
   *
   * ⚠️ Il se vérifie en DEUX temps, et le premier ne peut pas être une boucle :
   * sur base vierge la liste est vide, et parcourir le vide n'affirme rien. Le
   * cas vierge s'affirme donc par l'égalité, le cas peuplé par la boucle — et
   * c'est leur conjonction qui ferme le trou d'origine.
   */
  it("ne sert aucun article sur lequel on ne pourrait pas agir", async () => {
    expect((await publicView()).content.paragraphs).toEqual([]);

    await addParagraph("un");
    await addParagraph("deux");

    const served = (await publicView()).content.paragraphs;
    expect(served).toHaveLength(2);

    for (const paragraph of served) {
      await staff()
        .put(`/admin/content/sales-terms/paragraphs/${paragraph.id}`)
        .send(prose("relu"))
        .expect(204);
    }
  });

  it("rend 404 sur un article inconnu", async () => {
    await addParagraph("un");
    await staff()
      .put("/admin/content/sales-terms/paragraphs/art_inexistant")
      .send(prose("deux"))
      .expect(404);
    await staff().delete("/admin/content/sales-terms/paragraphs/art_inexistant").expect(404);
  });

  it("rend 400 sur un rang hors du document", async () => {
    const id = await addParagraph("un");

    // Un seul article : le seul rang valide est 0. La borne haute ne peut pas
    // vivre dans le schéma, elle dépend du document.
    await staff()
      .put(`/admin/content/sales-terms/paragraphs/${id}/position`)
      .send({ position: 4 })
      .expect(400);
    await staff()
      .put(`/admin/content/sales-terms/paragraphs/${id}/position`)
      .send({ position: -1 })
      .expect(400);
  });

  it("refuse en 400 un article à qui il manque une langue", async () => {
    const incomplete: Record<string, unknown> = { ...prose("un") };
    delete incomplete["it"];

    await staff().post("/admin/content/sales-terms/paragraphs").send(incomplete).expect(400);
  });

  it("refuse en 400 un corps vide", async () => {
    const empty = prose("un");
    const wrong = { ...empty, fr: { title: empty.fr.title, body: "   " } };

    await staff().post("/admin/content/sales-terms/paragraphs").send(wrong).expect(400);
  });
});
