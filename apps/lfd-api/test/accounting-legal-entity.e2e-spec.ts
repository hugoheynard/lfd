/**
 * E2E de l'**entité juridique émettrice** — notre identité, notre ICS, notre
 * compte.
 *
 * Ce que ces e2e éprouvent et qu'aucun test unitaire ne peut prouver :
 *
 * - la ligne s'écrit vraiment, et l'**unicité du SIREN** est tenue par la base ;
 * - l'ICS attribué deux fois avec deux valeurs remonte en **409** à travers tout
 *   le filtre d'erreurs, pas en 500 ;
 * - 🔴 et surtout : **l'IBAN créancier ne ressort par aucune route.** Il entre en
 *   clair par une seule, et c'est la seule chose que ce contexte doit garantir
 *   au-delà de ses invariants métier. Un test unitaire ne le prouve pas — il ne
 *   voit qu'un mapper, pas ce que le serveur sérialise réellement.
 *
 * Une seule frontière doublée : le verifier staff. Tout le reste est réel — le
 * SQL, les contraintes, le filtre d'erreurs, la résolution d'accès.
 */
import type { LegalEntityView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

/** SIREN dont la clé de Luhn est bonne : un SIREN inventé se fait refuser. */
const SIREN = "552100554";
const ICS = "FR72ZZZ123456";
/** IBAN d'exemple de la documentation EPC — clé mod-97 valide. */
const IBAN = "FR1420041010050500013M02606";

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

function declaration(siren = SIREN): Record<string, unknown> {
  return {
    name: "La Folie Douce",
    legalForm: "SAS",
    siren,
    rcs: "Chambéry B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR89552100554",
    address: {
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    },
  };
}

async function declare(siren = SIREN): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send(declaration(siren))
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

describe("Entité juridique — déclaration", () => {
  it("écrit la ligne, et l'entité neuve ne peut pas encore encaisser", async () => {
    const id = await declare();

    const response = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    const entity = jsonBody<LegalEntityView>(response);

    expect(entity).toMatchObject({ name: "La Folie Douce", siren: SIREN, ics: "" });
    // L'attente de l'ICS est un état normal, et la fiche le DIT au lieu de
    // montrer une entité qui aurait l'air prête.
    expect(entity.canCollect).toBe(false);
    expect(entity.missingToCollect.length).toBe(2);
  });

  it("refuse un SIREN déjà déclaré — la base tient l'unicité, pas la relecture", async () => {
    await declare();

    // Deux entités sous le même SIREN sont la même personne morale. Le refus
    // vient de l'INDEX, pas d'une relecture applicative : c'est ce qui le rend
    // insensible à la concurrence — et la plateforme traduit déjà la violation
    // d'unicité en 409, sans qu'on ait à la rattraper ici.
    await staff().post("/admin/accounting/legal-entities").send(declaration()).expect(409);
  });

  it("refuse un SIREN dont la clé est fausse, en 400 et sans rien écrire", async () => {
    await staff()
      .post("/admin/accounting/legal-entities")
      .send(declaration("552100555"))
      .expect(400);

    await staff().get("/admin/accounting/legal-entities").expect(200);
    const response = await staff().get("/admin/accounting/legal-entities").expect(200);
    expect(jsonBody<readonly LegalEntityView[]>(response)).toHaveLength(0);
  });
});

describe("Entité juridique — l'ICS ne se remplace pas", () => {
  it("l'attribue, puis REFUSE un autre en 409 en nommant celui qui tient", async () => {
    const id = await declare();

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);

    const refusal = await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: "FR72ZZZ999999" })
      .expect(409);

    // Le message est lu par du personnel sans le code sous les yeux : il doit
    // nommer le cas réel ET le geste de sortie.
    expect(JSON.stringify(refusal.body)).toContain(ICS);

    const response = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(response).ics).toBe(ICS);
  });

  it("accepte le même ICS rejoué — un double-clic ne doit pas afficher d'erreur", async () => {
    const id = await declare();

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);
  });
});

describe("Entité juridique — le compte créancier", () => {
  /**
   * 🔴 Régression à venir plutôt que régression passée : l'IBAN créancier est la
   * PREMIÈRE coordonnée bancaire à entrer dans cette base. Le jour où quelqu'un
   * ajoutera un champ à `LegalEntityView` en recopiant `toPersistence()`, ce
   * test est le seul qui rougira.
   */
  it("entre en clair par une seule route et ne ressort par AUCUNE", async () => {
    const id = await declare();

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({ iban: IBAN })
      .expect(204);

    const one = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    const all = await staff().get("/admin/accounting/legal-entities").expect(200);

    expect(JSON.stringify(one.body)).not.toContain(IBAN);
    expect(JSON.stringify(all.body)).not.toContain(IBAN);
    // Quatre caractères suffisent à reconnaître le compte — la seule question
    // qu'on pose devant une fiche.
    expect(jsonBody<LegalEntityView>(one).creditorAccountLast4).toBe("2606");
  });

  it("refuse un IBAN dont la clé mod-97 est fausse — la faute de frappe ne se voit pas", async () => {
    const id = await declare();

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({ iban: "FR4120041010050500013M02606" })
      .expect(400);

    const response = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(response).creditorAccountLast4).toBe("");
  });

  it("ICS et compte réunis : l'entité devient capable d'encaisser", async () => {
    const id = await declare();

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({ iban: IBAN })
      .expect(204);

    const response = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    const entity = jsonBody<LegalEntityView>(response);
    expect(entity.canCollect).toBe(true);
    expect(entity.missingToCollect).toEqual([]);
  });
});

describe("Entité juridique — la fiche de mandat SEPA", () => {
  it("REFUSE de la rendre à une entité qui ne peut pas encaisser, en nommant ce qui manque", async () => {
    const id = await declare();

    // 409 et non 404 : l'entité existe. Les deux cas n'appellent pas le même
    // geste — l'un est un identifiant faux, l'autre une fiche à compléter.
    const response = await staff()
      .get(`/admin/accounting/legal-entities/${id}/mandat-sepa-exemple.pdf`)
      .expect(409);
    expect(JSON.stringify(response.body)).toContain("ICS");
  });

  it("la rend en PDF une fois l'ICS et le compte posés, sans l'IBAN du créancier", async () => {
    const id = await declare();
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({ iban: IBAN })
      .expect(204);

    const response = await staff()
      .get(`/admin/accounting/legal-entities/${id}/mandat-sepa-exemple.pdf`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("mandat-sepa-exemple");

    const pdf = response.body as Buffer;
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // 🔴 Ce que seul un e2e prouve : ce que le SERVEUR envoie réellement sur le
    // fil. Le test unitaire ne voit que ce que la fonction rend.
    expect(pdf.includes(Buffer.from(IBAN))).toBe(false);
  });
});

describe("Entité juridique — archivage et corrections", () => {
  it("archiver n'efface rien, et retire la capacité d'encaisser", async () => {
    const id = await declare();
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({ iban: IBAN })
      .expect(204);

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/archived`)
      .send({ archived: true })
      .expect(204);

    const response = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    const entity = jsonBody<LegalEntityView>(response);
    // La ligne est toujours là : un mandat signé la cite, et un DELETE ferait
    // de cette référence un trou.
    expect(entity).toMatchObject({ ics: ICS, name: "La Folie Douce", canCollect: false });
    expect(entity.archivedAt).not.toBeNull();
  });

  it("corriger l'identité ne touche ni au SIREN ni à l'ICS", async () => {
    const id = await declare();
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);

    await staff()
      .put(`/admin/accounting/legal-entities/${id}`)
      .send({
        name: "La Folie Douce Fournil",
        legalForm: "SASU",
        rcs: "Chambéry B 552 100 554",
        shareCapitalCents: 2_000_000,
        vatNumber: "FR89552100554",
        address: {
          line1: "3 avenue des Bleuets",
          line2: "Zone du Lac",
          postalCode: "73100",
          city: "Aix-les-Bains",
          countryCode: "FR",
        },
      })
      .expect(204);

    const response = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(response)).toMatchObject({
      name: "La Folie Douce Fournil",
      city: "Aix-les-Bains",
      siren: SIREN,
      ics: ICS,
    });
  });

  it("404 sur une entité inconnue, plutôt qu'un corps vide à interpréter", async () => {
    await staff().get("/admin/accounting/legal-entities/inexistante").expect(404);
  });
});
