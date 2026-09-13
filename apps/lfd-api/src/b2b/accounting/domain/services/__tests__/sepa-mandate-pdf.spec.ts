import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { DebtorSnapshot } from "../../debtor-snapshot.js";
import { renderSepaMandatePdf, sampleMandateFileName } from "../sepa-mandate-pdf.js";

const CREDITOR: CreditorSnapshot = {
  legalEntityId: "01JBQ0000000000000000000",
  name: "Crazeativity",
  legalForm: "SAS",
  siren: "900000001",
  vatNumber: "",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["Route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ900001",
  accountHolder: "CRAZEATIVITY",
  accountAddressLines: ["Route de la Balme", "73150 Val d'Isère", "FR"],
  creditorBic: "CEPAFRPP751",
  creditorIban: "FR7630006000011234567890189",
  preNotificationDays: 14,
  mandateContractDescription: "Fourniture de cafe et de viennoiseries",
  mandatePaymentType: "recurrent" as const,
};

/**
 * Le texte réellement dessiné, flux décompressés ET chaînes décodées.
 *
 * 🔴 **Deux pièges, et le second a failli rendre ce fichier inutile.**
 *
 * 1. `pdfkit` déflate ses flux de contenu : chercher une chaîne dans les octets
 *    bruts trouverait toujours « absent ».
 * 2. Une fois inflaté, le texte n'est pas lisible non plus — il est écrit en
 *    **chaînes hexadécimales** dans des tableaux `TJ`
 *    (`[<4e6f7465> 50 <2076f73>] TJ`), avec le crénage intercalé. Un simple
 *    `toString()` du flux ne contient donc aucun mot du document.
 *
 * Sans le décodage ci-dessous, l'assertion « l'IBAN n'est pas imprimé » passait
 * au vert **sans rien vérifier**. C'est le test de PRÉSENCE de l'ICS qui l'a
 * démasqué, et c'est pour ça qu'il est là : un extracteur muet rend toute
 * assertion d'absence toujours verte, donc toujours inutile.
 *
 * L'encodage des glyphes est WinAnsi, dont `latin1` est le sur-ensemble utile
 * ici : `e9` y vaut « é ». Les accents ressortent donc lisibles.
 */
function drawnText(pdf: Buffer): string {
  const parts: string[] = [];
  let from = 0;
  for (;;) {
    const start = pdf.indexOf("stream", from);
    if (start === -1) {
      break;
    }
    // 🔴 `endstream` CONTIENT « stream ». Sans cette garde, la recherche
    // repartait du mot de fin, reparsait un faux flux, et avalait tout jusqu'au
    // suivant — c'est-à-dire le texte qu'on cherchait. Le défaut est resté
    // invisible jusqu'à ce qu'une image embarquée déplace les décalages.
    if (pdf.subarray(start - 3, start).toString("latin1") === "end") {
      from = start + 6;
      continue;
    }
    const end = pdf.indexOf("endstream", start);
    if (end === -1) {
      break;
    }
    // `stream` est suivi d'un saut de ligne (CRLF ou LF) avant les données.
    const body = pdf.subarray(start + (pdf[start + 6] === 0x0d ? 8 : 7), end);
    let inflated: string;
    try {
      inflated = inflateSync(body).toString("latin1");
    } catch {
      // Un flux non déflaté (table de références, police embarquée) : on passe.
      inflated = body.toString("latin1");
    }
    from = end + 9;
    // Seuls les flux de CONTENU nous intéressent : `BT` ouvre un bloc de texte.
    // Sans ce tri, les octets d'une image inflatée passent dans le décodeur de
    // chaînes et rendent des kilo-octets de bruit qui noient le vrai texte.
    if (inflated.includes("BT")) {
      parts.push(decodeStrings(inflated));
    }
  }
  return parts.join("\n");
}

/** Les chaînes du flux — `<hex>` et `(littéral)` — remises en clair, dans l'ordre. */
function decodeStrings(stream: string): string {
  const out: string[] = [];
  for (const match of stream.matchAll(/<([0-9A-Fa-f\s]*)>|\((.*?)(?<!\\)\)/gu)) {
    const [, hex, literal] = match;
    if (hex !== undefined) {
      out.push(Buffer.from(hex.replace(/\s/gu, ""), "hex").toString("latin1"));
    } else if (literal !== undefined) {
      out.push(literal);
    }
  }
  return out.join("");
}

describe("renderSepaMandatePdf", () => {
  it("rend un PDF", async () => {
    const pdf = await renderSepaMandatePdf(CREDITOR, null);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rend les MÊMES octets deux fois — sans quoi rien ne serait comparable", async () => {
    const [first, second] = await Promise.all([
      renderSepaMandatePdf(CREDITOR, null),
      renderSepaMandatePdf(CREDITOR, null),
    ]);
    expect(first.equals(second)).toBe(true);
  });

  it("imprime l'ICS, le nom et l'adresse du créancier", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    expect(text).toContain("FR00ZZZ900001");
    // Le TITULAIRE du compte, pas la raison sociale — cf. le describe dédié.
    expect(text).toContain("CRAZEATIVITY");
    expect(text).toContain("Route de la Balme");
  });

  /**
   * Régression par anticipation : `CreditorSnapshot` PORTE `creditorIban`, et
   * les zones 5 et 6 de la fiche lui ressemblent — mais elles appellent l'IBAN
   * et le BIC **du débiteur**. Imprimer le nôtre à cet endroit produirait un
   * mandat nous autorisant à nous prélever nous-mêmes, diffusé à chaque client.
   *
   * L'assertion de présence ci-dessus est la condition de validité de celle-ci :
   * elle prouve que `drawnText` lit vraiment ce qui est dessiné.
   */
  it("n'imprime JAMAIS l'IBAN du créancier", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    expect(text).not.toContain("FR7630006000011234567890189");
    expect(text).not.toContain("FR76 3000 6000 0112 3456 7890 189");
  });

  it("laisse le bloc du débiteur et la signature vides", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    // Les légendes sont là — donc les zones sont dessinées — mais rien n'y est
    // écrit : la fiche est un exemplaire vierge, pas un mandat prérempli.
    expect(text).toContain("Nom / Pr\u00e9noms du d\u00e9biteur");
    expect(text).toContain("Veuillez signer ici");
  });

  /**
   * Le formulaire de la norme, pas une mise en page arrangée. Un mandat
   * redessiné « en plus propre » est un mandat qu'on relit deux fois : ces
   * légendes sont ce qu'un chargé de clientèle et un banquier citent.
   */
  it("porte les zones indicatives 14 à 20, dessinées et vides", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    expect(text).toContain("Informations relatives au contrat");
    expect(text).toContain("Code identifiant du tiers d\u00e9biteur");
    expect(text).toContain("Description du contrat");
  });

  /**
   * L'adresse de retour est le seul endroit où notre adresse sert à autre chose
   * qu'à nous identifier : elle dit au client où poster la fiche signée.
   */
  it("prérempli l'adresse de retour, et rappelle la borne des 35 caractères", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    expect(text).toContain("A retourner \u00e0 :");
    expect(text).toContain("Zone r\u00e9serv\u00e9e \u00e0 l'usage exclusif du cr\u00e9ancier");
    expect(text).toContain("longueur maximum de 35 caract\u00e8res");
  });

  it("porte la mention EXEMPLE, pour qu'une signature apposée dessus ne trompe personne", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    expect(text).toContain("EXEMPLE");
  });
});

describe("sampleMandateFileName", () => {
  it("dérive un nom lisible sur un bureau", () => {
    expect(sampleMandateFileName(CREDITOR)).toBe("mandat-sepa-exemple-crazeativity.pdf");
  });

  it("retire accents et ponctuation plutôt que de les laisser au navigateur", () => {
    const named = { ...CREDITOR, name: "Boulangerie Émile & Fils (Val d'Isère)" };
    expect(sampleMandateFileName(named)).toBe(
      "mandat-sepa-exemple-boulangerie-emile-fils-val-d-isere.pdf",
    );
  });
});

/**
 * 🔴 Le mandat imprime le créancier **tel que la banque le connaît** — le
 * titulaire du compte —, pas la raison sociale du registre. Les deux coïncident
 * presque toujours, et c'est « presque » qui décide : le débiteur rapproche le
 * papier de sa ligne de relevé, et cette ligne vient du titulaire du compte
 * (branché le 2026-09-12).
 */
describe("renderSepaMandatePdf — quel créancier est imprimé", () => {
  it("imprime le TITULAIRE du compte, et PAS la raison sociale, quand ils diffèrent", async () => {
    const text = drawnText(
      await renderSepaMandatePdf(
        { ...CREDITOR, name: "Ancienne Raison Sociale", accountHolder: "CRAZEATIVITY SAS" },
        null,
      ),
    );

    expect(text).toContain("CRAZEATIVITY SAS");
    expect(text).not.toContain("Ancienne Raison Sociale");
  });

  it("imprime l'adresse DU RIB, et pas celle du siège, quand elles diffèrent", async () => {
    const text = drawnText(
      await renderSepaMandatePdf(
        {
          ...CREDITOR,
          addressLines: ["Siège social", "75001 Paris", "FR"],
          accountAddressLines: ["Agence de la Balme", "73150 Val d'Isère", "FR"],
        },
        null,
      ),
    );

    expect(text).toContain("Agence de la Balme");
    expect(text).not.toContain("Siège social");
  });

  /**
   * Le nom imprimé est repris DANS le texte d'autorisation (« vous autorisez
   * (A) … »), pas seulement dans la zone 7. Un mandat qui autoriserait un nom et
   * en nommerait un autre plus bas serait contestable.
   */
  it("emploie le MÊME nom dans l'autorisation et dans la zone du créancier", async () => {
    const text = drawnText(
      await renderSepaMandatePdf({ ...CREDITOR, accountHolder: "TITULAIRE UNIQUE" }, null),
    );

    expect(text.split("TITULAIRE UNIQUE").length - 1).toBeGreaterThan(1);
  });

  /** Repli pour les entités renseignées avant que le bloc du RIB existe. */
  it("retombe sur la raison sociale et le siège quand aucun RIB n'est recopié", async () => {
    const text = drawnText(
      await renderSepaMandatePdf(
        { ...CREDITOR, accountHolder: null, accountAddressLines: [] },
        null,
      ),
    );

    expect(text).toContain("Crazeativity");
    expect(text).toContain("Route de la Balme");
  });
});

/**
 * La zone 8 est dessinée **en cases**, comme l'IBAN et le BIC du débiteur
 * (2026-09-12). Le risque qu'un peigne introduit est la TRONCATURE : une case de
 * moins que de caractères, sur un identifiant que le débiteur oppose à sa
 * banque, ne se verrait qu'en contestation.
 */
describe("renderSepaMandatePdf — l'ICS en cases", () => {
  it("imprime les 13 caractères d'un ICS français", async () => {
    const text = drawnText(await renderSepaMandatePdf({ ...CREDITOR, ics: "FR00ZZZ900001" }, null));

    expect(text).toContain("FR00ZZZ900001");
  });

  /**
   * `CreditorIdentifier` accepte jusqu'à 35 caractères ; seuls les ICS français
   * sont contraints à 13. Un peigne de taille fixe aurait coupé les autres.
   */
  it("imprime EN ENTIER un ICS étranger plus long, sans en perdre un caractère", async () => {
    const long = "DE98ZZZ09999999999";

    const text = drawnText(await renderSepaMandatePdf({ ...CREDITOR, ics: long }, null));

    expect(text).toContain(long);
  });

  /**
   * Au-delà de ce que la largeur du formulaire admet, on retombe sur la ligne
   * pointillée — le numéro y tient en entier, et c'est la seule chose qui ne se
   * négocie pas. Un identifiant coupé par le bord de la page serait pire.
   */
  it("garde le numéro entier même au-delà de ce que les cases admettent", async () => {
    const veryLong = `BE69ZZZ${"9".repeat(28)}`;

    const text = drawnText(await renderSepaMandatePdf({ ...CREDITOR, ics: veryLong }, null));

    expect(veryLong).toHaveLength(35);
    expect(text).toContain(veryLong);
  });
});

/** Le RIB d'un client, tel que l'aperçu le remplit. */
const DEBTOR: DebtorSnapshot = {
  holder: "Refuge du Col SARL",
  addressLine1: "12 rue des Alpages",
  addressLine2: "",
  postalCode: "73150",
  city: "Val d'Isere",
  countryCode: "FR",
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  debtorReference: "C-9P2X4B",
  contractNumber: "CT-42",
};

describe("renderSepaMandatePdf — le côté du débiteur", () => {
  it("laisse les zones 1 à 6 VIERGES sans débiteur : c'est la fiche d'exemple", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    expect(text).not.toContain("Refuge du Col");
  });

  it("imprime le titulaire, son adresse et son pays", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null, DEBTOR));
    expect(text).toContain("Refuge du Col SARL");
    expect(text).toContain("12 rue des Alpages");
    expect(text).toContain("Val d'Isere");
  });

  it("recolle le complément d'adresse plutôt que de le perdre", async () => {
    // « Bâtiment B » perdu, le courrier de la banque n'arrive pas — et le
    // formulaire n'a qu'UNE ligne d'adresse.
    const text = drawnText(
      await renderSepaMandatePdf(CREDITOR, null, { ...DEBTOR, addressLine2: "Batiment B" }),
    );
    expect(text).toContain("12 rue des Alpages, Batiment B");
  });

  it("remplit les zones facultatives propres à CE client", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null, DEBTOR));
    expect(text).toContain("C-9P2X4B");
    expect(text).toContain("CT-42");
  });

  /**
   * 🔴 La zone 20 vient de l'ÉMETTEUR, pas du client : elle décrit ce que nous
   * vendons. Elle s'imprime donc même sur la fiche d'EXEMPLE, qui n'a aucun
   * débiteur — c'est ce qui distingue un réglage d'entité d'une saisie par
   * dossier.
   */
  it("imprime la description du contrat MÊME sans débiteur", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null));
    expect(text).toContain("Fourniture de cafe et de viennoiseries");
  });

  it("garde la mention EXEMPLE même avec un débiteur", async () => {
    // 🔴 Aucune RUM n'est frappée : une signature apposée sur cet aperçu
    // créerait un mandat sans référence, inutilisable, mais que le client
    // croirait avoir donné.
    const text = drawnText(await renderSepaMandatePdf(CREDITOR, null, DEBTOR));
    expect(text).toContain("EXEMPLE");
  });

  /**
   * 🔴 Régression : `comb` remplissait case par case et ignorait SILENCIEUSEMENT
   * tout caractère au-delà de la dernière. Le peigne de l'IBAN compte 27 cases ;
   * un IBAN maltais en fait 31. Il sortait amputé sur le papier signé pendant
   * que la base en gardait la forme entière (fix 2026-09-12).
   */
  it("REFUSE un IBAN plus long que le peigne, au lieu de le tronquer", async () => {
    const tooLong = "MT84MALT011000012345MTLCAST001S";
    expect(tooLong.length).toBeGreaterThan(27);

    await expect(
      renderSepaMandatePdf(CREDITOR, null, { ...DEBTOR, iban: tooLong }),
    ).rejects.toThrow(/27/u);
  });

  it("accepte un IBAN plus court que le peigne", async () => {
    // La Norvège en a 15 : le peigne garde ses cases vides à droite, ce qui est
    // le rendu normal d'un formulaire à cases.
    const text = drawnText(
      await renderSepaMandatePdf(CREDITOR, null, { ...DEBTOR, iban: "NO9386011117947" }),
    );
    expect(text).toContain("Refuge du Col SARL");
  });

  it("REFUSE un BIC plus long que ses 11 cases", async () => {
    await expect(
      renderSepaMandatePdf(CREDITOR, null, { ...DEBTOR, bic: "CEPAFRPP751XXXX" }),
    ).rejects.toThrow(/11/u);
  });
});
