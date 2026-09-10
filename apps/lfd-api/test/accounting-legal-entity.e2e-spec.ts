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
import type { BillingCycleView, LegalEntityView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { storageKeys } from "./storage.js";

/** SIREN dont la clé de Luhn est bonne : un SIREN inventé se fait refuser. */
const SIREN = "552100554";
/** Second SIREN à clé de Luhn valide — les cas d'archivage exigent deux entités. */
const SIREN_BIS = "552081317";
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

describe("Le brouillon de fichier de prélèvement", () => {
  it("REFUSE de le rendre pour une entité qui ne peut pas encaisser", async () => {
    const id = await declare();
    await staff().get(`/admin/accounting/billing-cycle/draft.xml?legalEntityId=${id}`).expect(409);
  });

  /**
   * 🔴 Ce que seul un e2e prouve : ce que le SERVEUR envoie sur le fil. Le bloc
   * créancier doit être RÉEL — c'est la moitié qu'on vient vérifier — et le bloc
   * débiteur doit être INDÉPOSABLE, parce qu'un lot incomplet qui ressemble à un
   * lot valide est ce qui finit déposé un vendredi soir.
   */
  it("rend un XML dont le créancier est vrai et le débiteur impossible", async () => {
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
      .get(`/admin/accounting/billing-cycle/draft.xml?legalEntityId=${id}`)
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/xml");
    // L'avertissement voyage avec le fichier : dans son nom ET dans son corps.
    expect(response.headers["content-disposition"]).toContain("BROUILLON");
    expect(response.text).toContain("CE FICHIER NE PEUT PAS ETRE DEPOSE");

    // Notre côté, réel.
    expect(response.text).toContain(`<Id>${ICS}</Id>`);
    expect(response.text).toContain(`<IBAN>${IBAN}</IBAN>`);

    // Le côté débiteur, impossible — et surtout : AUCUN IBAN plausible ailleurs
    // que le nôtre. C'est l'assertion qui empêcherait une régression où un
    // gabarit inventerait des coordonnées pour « faire propre ».
    const ibans = [...response.text.matchAll(/<IBAN>([^<]*)</gu)].map((m) => m[1] ?? "");
    expect(ibans.filter((value) => /^[A-Z]{2}\d{2}[A-Za-z0-9]+$/u.test(value))).toEqual([IBAN]);
  });

  /**
   * 🔴 Le contrôle vaut par le fait qu'il RELIT le fichier téléchargé, pas par
   * ce qu'il calcule. Cet e2e le vérifie sur le fil : le CSV et le XML sortent
   * du même chemin, et le verdict porte sur le second.
   */
  it("rend un CSV de contrôle qui atteste le XML téléchargé", async () => {
    const id = await declare();
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({ iban: IBAN })
      .expect(204);

    const xml = await staff()
      .get(`/admin/accounting/billing-cycle/draft.xml?legalEntityId=${id}`)
      .expect(200);
    const csv = await staff()
      .get(`/admin/accounting/billing-cycle/draft-audit.csv?legalEntityId=${id}`)
      .expect(200);

    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["content-disposition"]).toContain("CONTROLE");
    // Le BOM, sans quoi le tableur du comptable lit l'UTF-8 en Latin-1.
    expect(csv.text.startsWith("\uFEFF")).toBe(true);

    // Le verdict porte sur le fichier qu'on vient de télécharger.
    expect(csv.text).toContain("COHÉRENT");
    expect(csv.text).not.toContain("INCOHÉRENT");

    // Et le total qu'il rapporte est bien celui que le XML DÉCLARE.
    const declared = /<CtrlSum>([^<]*)</u.exec(xml.text)?.[1] ?? "";
    expect(csv.text).toContain(declared.replace(".", ","));
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
    // Sans `?inline`, le navigateur ENREGISTRE. C'est le défaut, et il l'est
    // pour la raison écrite dans `contentDispositionAttachment`.
    expect(response.headers["content-disposition"]).toContain("attachment");

    const shown = await staff()
      .get(`/admin/accounting/legal-entities/${id}/mandat-sepa-exemple.pdf?inline=1`)
      .expect(200);
    // Avec `?inline`, il AFFICHE — le bouton « Voir » de l'écran ne doit pas
    // remplir un dossier de téléchargements pour vérifier une adresse.
    expect(shown.headers["content-disposition"]).toContain("inline");

    // Régression par anticipation : la première version testait la seule
    // PRÉSENCE du paramètre, donc `?inline=0` affichait. Un drapeau qui dit oui
    // quand on écrit non est pire que pas de drapeau.
    const refused = await staff()
      .get(`/admin/accounting/legal-entities/${id}/mandat-sepa-exemple.pdf?inline=0`)
      .expect(200);
    expect(refused.headers["content-disposition"]).toContain("attachment");

    const pdf = response.body as Buffer;
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // 🔴 Ce que seul un e2e prouve : ce que le SERVEUR envoie réellement sur le
    // fil. Le test unitaire ne voit que ce que la fonction rend.
    expect(pdf.includes(Buffer.from(IBAN))).toBe(false);
  });
});

describe("Le cycle de prélèvement", () => {
  it("rend une fenêtre bornée à minuit LOCAL, et deux appels rendent la même", async () => {
    const first = await staff().get("/admin/accounting/billing-cycle/current").expect(200);
    const cycle = jsonBody<BillingCycleView>(first);

    expect(new Date(cycle.closesAt).getTime()).toBeGreaterThan(new Date(cycle.startsAt).getTime());
    // 🔴 Minuit à Paris n'est jamais minuit UTC : l'écart vaut une heure en
    // hiver, deux en été. Une borne à `T00:00:00.000Z` signalerait que la
    // conversion de fuseau a sauté quelque part entre le domaine et le fil.
    expect(cycle.closesAt.endsWith("T00:00:00.000Z")).toBe(false);
    expect(cycle.closesAt).toMatch(/T2[23]:00:00\.000Z$/u);

    // Une lecture ne clôture rien : la fenêtre ne bouge pas.
    const second = await staff().get("/admin/accounting/billing-cycle/current").expect(200);
    expect(jsonBody<BillingCycleView>(second)).toEqual(cycle);
  });
});

describe("Entité juridique — on n'archive pas la dernière", () => {
  /**
   * Rien ne se corromprait : les documents déjà émis citent l'entité par son
   * identifiant, et archiver n'efface rien. Ce qui se casse est plus sournois —
   * plus rien ne peut être émis ni prélevé, et l'écran qui le dirait est celui
   * qu'on vient de vider. C'est un accident à un clic dont le symptôme
   * n'apparaît qu'au prochain cycle.
   */
  it("REFUSE en 409, et nomme le geste de sortie", async () => {
    const id = await declare();

    const response = await staff()
      .put(`/admin/accounting/legal-entities/${id}/archived`)
      .send({ archived: true })
      .expect(409);
    expect(JSON.stringify(response.body)).toContain("Déclarez d'abord");

    // Et rien n'a bougé : un refus qui aurait déjà écrit serait pire qu'aucun.
    const after = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(after).archivedAt).toBeNull();
  });

  it("l'autorise dès qu'une seconde entité existe", async () => {
    const id = await declare();
    await declare(SIREN_BIS);

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/archived`)
      .send({ archived: true })
      .expect(204);
  });

  /**
   * La vue porte le fait, pour que l'écran désactive le bouton. Un bouton dont
   * la seule issue est un 409 est une affordance qui ment — la règle déjà
   * appliquée au champ ICS refermé.
   */
  it("dit dans la vue qu'elle est la dernière, et cesse de le dire ensuite", async () => {
    const id = await declare();

    const seule = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(seule).isLastActive).toBe(true);

    await declare(SIREN_BIS);
    const accompagnee = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(accompagnee).isLastActive).toBe(false);

    // La LISTE dit la même chose que la fiche : deux définitions de « la
    // dernière » divergeraient, et c'est celle que l'utilisateur lit qui
    // dériverait.
    const liste = await staff().get("/admin/accounting/legal-entities").expect(200);
    expect(jsonBody<readonly LegalEntityView[]>(liste).every((e) => !e.isLastActive)).toBe(true);
  });

  /** Remettre en service ne peut qu'augmenter le nombre d'entités disponibles. */
  it("ne bloque JAMAIS la remise en service", async () => {
    const id = await declare();
    const autre = await declare(SIREN_BIS);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/archived`)
      .send({ archived: true })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${autre}/archived`)
      .send({ archived: true })
      .expect(409);

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/archived`)
      .send({ archived: false })
      .expect(204);
  });
});

describe("Entité juridique — archivage et corrections", () => {
  it("archiver n'efface rien, et retire la capacité d'encaisser", async () => {
    const id = await declare();
    // Une remplaçante, sans quoi le serveur refuse : on n'archive pas la
    // dernière entité en service.
    await declare(SIREN_BIS);
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

/**
 * Un PNG **réel** aux dimensions demandées : signature, IHDR qui les porte,
 * IEND. Fabriqué plutôt que chargé d'un fichier — les dimensions sont le sujet
 * de la moitié de ces cas, et un fichier d'appoint les rendrait invisibles.
 */
function png(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
}

/** Un JPEG réel : `SOI`, un `SOF0` qui porte les dimensions, `EOI`. */
function jpeg(width: number, height: number): Buffer {
  const frame = Buffer.alloc(11);
  frame.writeUInt16BE(11, 0);
  frame[2] = 8;
  frame.writeUInt16BE(height, 3);
  frame.writeUInt16BE(width, 5);
  frame[7] = 1;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xc0]),
    frame,
    Buffer.from([0xff, 0xd9]),
  ]);
}

/**
 * E2E du **logo de l'entité émettrice**.
 *
 * Le stockage objet est RÉEL (MinIO, qui parle S3 comme R2) : le fichier part
 * vraiment et revient vraiment. Un magasin en mémoire prouverait le contrat HTTP
 * et rien de la chaîne — or c'est la chaîne qui casse en ligne.
 */
describe("Entité juridique — le logo", () => {
  it("un PNG carré monte, redescend, et bascule hasLogo", async () => {
    const id = await declare();

    const before = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(before).hasLogo).toBe(false);

    const bytes = png(256, 256);
    await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", bytes, "logo.png")
      .expect(204);

    const after = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(after).hasLogo).toBe(true);
    // Le logo ne conditionne RIEN : l'entité n'a toujours ni ICS ni compte.
    expect(jsonBody<LegalEntityView>(after).canCollect).toBe(false);

    const served = await staff()
      .get(`/admin/accounting/legal-entities/${id}/logo`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (part: Buffer) => chunks.push(part));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(served.headers["content-type"]).toContain("image/png");
    // `inline` : l'écran affiche une vignette, il ne remplit pas un dossier de
    // téléchargements. Légitime ICI parce que le type est relu dans les octets
    // et ne peut valoir que `image/png` ou `image/jpeg`.
    expect(served.headers["content-disposition"]).toContain("inline");
    expect((served.body as Buffer).equals(bytes)).toBe(true);
  });

  it("refuse un JPEG 4000 × 100 en 400, en nommant les dimensions reçues", async () => {
    const id = await declare();

    const refusal = await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", jpeg(4000, 100), "banniere.jpg")
      .expect(400);

    // Le message est lu par du personnel sans le code sous les yeux : il nomme
    // ce qu'on a envoyé, et le geste (recadrer au carré).
    expect(JSON.stringify(refusal.body)).toContain("4000");
    expect(JSON.stringify(refusal.body)).toContain("100");

    const view = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(view).hasLogo).toBe(false);
    // Rien n'est parti au stockage : on ne range jamais un fichier refusé.
    expect(await storageKeys()).toEqual([]);
  });

  it("refuse un PDF déguisé en .png — le mimetype annoncé ne décide de rien", async () => {
    const id = await declare();

    await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", Buffer.from("%PDF-1.4\nrien d'une image", "latin1"), {
        filename: "logo.png",
        contentType: "image/png",
      })
      .expect(400);

    expect(await storageKeys()).toEqual([]);
  });

  it("refuse un PNG de 220 px de côté — sous 256, le rond est flou à l'impression", async () => {
    const id = await declare();

    const refusal = await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", png(220, 220), "logo.png")
      .expect(400);

    expect(JSON.stringify(refusal.body)).toContain("256");
  });

  /**
   * 🔴 **La clé de stockage ne doit apparaître dans AUCUNE réponse.** Une clé qui
   * sort d'une API est une clé qu'on finit par accepter en ENTRÉE — c'est-à-dire
   * un appelant qui choisit l'objet qu'on lui sert. Ce test est le seul qui
   * rougira le jour où quelqu'un ajoutera un champ à `LegalEntityView` en
   * recopiant `toPersistence()`.
   */
  it("ne laisse la clé de stockage sortir par AUCUNE route", async () => {
    const id = await declare();
    await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", png(256, 256), "logo.png")
      .expect(204);

    // La clé telle qu'elle est vraiment rangée, lue dans le bucket — pas une
    // constante recopiée qui pourrait diverger de ce que le code compose.
    const [key] = await storageKeys();
    expect(key).toBe(`legal-entities/${id}/logo`);

    const one = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    const all = await staff().get("/admin/accounting/legal-entities").expect(200);

    expect(JSON.stringify(one.body)).not.toContain(key);
    expect(JSON.stringify(all.body)).not.toContain(key);
    expect(JSON.stringify(one.body)).not.toContain("logoKey");
    expect(JSON.stringify(all.body)).not.toContain("legal-entities/");
  });

  it("remplace à la même clé plutôt que d'accumuler des orphelins", async () => {
    const id = await declare();

    await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", png(256, 256), "logo.png")
      .expect(204);
    await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", png(400, 400), "autre.png")
      .expect(204);

    expect(await storageKeys()).toHaveLength(1);
  });

  it("retire le logo ; la route de service répond alors 404", async () => {
    const id = await declare();
    await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", png(256, 256), "logo.png")
      .expect(204);

    await staff().delete(`/admin/accounting/legal-entities/${id}/logo`).expect(204);

    const view = await staff().get(`/admin/accounting/legal-entities/${id}`).expect(200);
    expect(jsonBody<LegalEntityView>(view).hasLogo).toBe(false);
    await staff().get(`/admin/accounting/legal-entities/${id}/logo`).expect(404);
  });

  it("404 quand aucun logo n'a jamais été déposé", async () => {
    const id = await declare();
    await staff().get(`/admin/accounting/legal-entities/${id}/logo`).expect(404);
  });

  /**
   * Une entité sans logo rend un mandat **valide** : la cellule d'en-tête reste
   * vide, sans placeholder. C'est le formulaire de la norme, sans notre rond.
   */
  it("rend un mandat valide avec ET sans logo, et les deux diffèrent", async () => {
    const id = await declare();
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: ICS })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({ iban: IBAN })
      .expect(204);

    const withoutLogo = await mandate(id);
    expect(withoutLogo.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    await staff()
      .post(`/admin/accounting/legal-entities/${id}/logo`)
      .attach("file", png(256, 256), "logo.png")
      .expect(204);

    const withLogo = await mandate(id);
    expect(withLogo.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Le logo est vraiment DESSINÉ : sans cette assertion, un rendu qui
    // ignorerait le second paramètre passerait les deux cas précédents.
    expect(withLogo.equals(withoutLogo)).toBe(false);
  });
});

/** Les octets de la fiche de mandat — supertest ne les rend pas sans parseur. */
async function mandate(id: string): Promise<Buffer> {
  const response = await staff()
    .get(`/admin/accounting/legal-entities/${id}/mandat-sepa-exemple.pdf`)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (part: Buffer) => chunks.push(part));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return response.body as Buffer;
}
