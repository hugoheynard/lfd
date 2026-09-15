import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { BillableCompany } from "../../ports/billable-orders.reader.js";
import {
  BIC_NOT_PROVIDED,
  cycleTagOf,
  isDepositable,
  isSchemeFileDepositable,
  renderPain008,
} from "../pain008.js";
import { CreditorBicMissingError } from "../../errors/accounting-errors.js";
import type { DebtorMandate } from "../../ports/debtor-mandate.reader.js";
import type { SepaScheme } from "../../value-objects/sepa-scheme.js";

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
  // Zones 20 et 12 du mandat et schéma des frappes à venir. Le `pain.008` ne lit
  // que la zone 12, et seulement pour un fichier vide : le lot suit le MANDAT.
  mandateContractDescription: "Fourniture de pains et viennoiseries",
  mandatePaymentType: "recurrent",
  mandateScheme: "B2B",
};

/** Cycle de septembre : clos le 1er octobre à 00h00 locales (heure d'été). */
const CYCLE_START = new Date("2026-08-31T22:00:00.000Z");
const CYCLE_END = new Date("2026-09-30T22:00:00.000Z");
const CREATED_AT = new Date("2026-09-30T21:05:00.000Z");

const LINES: readonly BillableCompany[] = [
  {
    companyId: "cmp_tommeuses",
    companyName: "SAS Les Tommeuses",
    orderCount: 8,
    totalCents: 151_648,
  },
  {
    companyId: "cmp_isere",
    companyName: "Boulangerie Émile & Fils",
    orderCount: 3,
    totalCents: 42_050,
  },
];

const TOMMEUSES: DebtorMandate = {
  reference: "LFC-9P2X4B-260912-K7M3QT",
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  scheme: "B2B",
  paymentType: "recurrent",
};
const ISERE: DebtorMandate = {
  reference: "LFC-7K2M4P-260912-B4X9RD",
  iban: "FR7612548029980123456789161",
  bic: null,
  scheme: "B2B",
  paymentType: "recurrent",
};

/** Les deux lignes, toutes deux prélevables en B2B. */
const ALL_MANDATES = new Map<string, DebtorMandate>([
  ["cmp_tommeuses", TOMMEUSES],
  ["cmp_isere", ISERE],
]);

/** Le même cycle, un mandat par schéma. */
const MIXED_MANDATES = new Map<string, DebtorMandate>([
  ["cmp_tommeuses", { ...TOMMEUSES, scheme: "CORE" }],
  ["cmp_isere", ISERE],
]);

function render(
  lines: readonly BillableCompany[] = LINES,
  mandates: ReadonlyMap<string, DebtorMandate> = new Map(),
  creditor: CreditorSnapshot = CREDITOR,
  scheme: SepaScheme = "B2B",
): string {
  return renderPain008({
    creditor,
    scheme,
    cycleStart: CYCLE_START,
    cycleEnd: CYCLE_END,
    createdAt: CREATED_AT,
    mandates,
    lines,
  });
}

function values(xml: string, tagName: string): readonly string[] {
  return [...xml.matchAll(new RegExp(`<${tagName}>([^<]*)<`, "gu"))].map((m) => m[1] ?? "");
}

describe("renderPain008 — le brouillon, et ce qui le rend indéposable", () => {
  /**
   * 🔴 Une société sans mandat n'a pas de schéma, donc n'entre dans aucun
   * fichier. Elle ne doit pas pour autant DISPARAÎTRE : le bandeau la nomme, et
   * aucun IBAN plausible n'est inventé à sa place.
   */
  it("n'écrit aucune ligne sans mandat, la nomme, et n'invente aucun compte", () => {
    const xml = render();

    expect(xml).not.toContain("<DrctDbtTxInf>");
    expect(xml).toContain("- SAS Les Tommeuses");
    expect(xml).toContain("- Boulangerie Emile Fils");
    expect(values(xml, "IBAN")).toEqual([CREDITOR.creditorIban]);
  });

  it("porte l'avertissement dans l'en-tête ET dans l'identifiant du message", () => {
    const xml = render();
    expect(xml).toContain("CE FICHIER NE PEUT PAS ETRE DEPOSE");
    expect(xml).toContain("<MsgId>BROUILLON-202609-B2B</MsgId>");
  });

  it("rend les MÊMES octets deux fois — sans quoi rien n'est comparable", () => {
    expect(render()).toBe(render());
  });
});

describe("renderPain008 — ce qui fait rejeter un lot", () => {
  it("fait tomber juste NbOfTxs et CtrlSum, aux DEUX niveaux", () => {
    const xml = render(LINES, ALL_MANDATES);
    // 151648 + 42050 = 193698 centimes.
    expect(xml.match(/<NbOfTxs>2<\/NbOfTxs>/gu)).toHaveLength(2);
    expect(xml.match(/<CtrlSum>1936\.98<\/CtrlSum>/gu)).toHaveLength(2);
  });

  it("écrit les montants au point décimal, deux décimales, toujours", () => {
    const xml = render([{ ...LINES[0]!, totalCents: 500 }], ALL_MANDATES);
    expect(xml).toContain(`<InstdAmt Ccy="EUR">5.00</InstdAmt>`);
  });

  /**
   * Beaucoup de banques françaises refusent un `CreDtTm` porteur d'un décalage.
   * Et l'instant est rendu en heure LOCALE : ici 21h05 UTC en heure d'été, donc
   * 23h05 à Paris. Un `toISOString()` aurait écrit 21h05 — et daté le fichier du
   * mauvais jour, un soir de fin de mois.
   */
  it("date le fichier en heure locale, sans décalage horaire", () => {
    const xml = render();
    expect(xml).toContain("<CreDtTm>2026-09-30T23:05:00</CreDtTm>");
    expect(xml).not.toMatch(/<CreDtTm>[^<]*(Z|\+\d{2}:\d{2})<\/CreDtTm>/u);
  });

  it("n'écrit aucun caractère hors du jeu SEPA restreint", () => {
    const xml = render(LINES, ALL_MANDATES);
    // « Émile & Fils » a un accent ET une esperluette : l'un sort du jeu SEPA,
    // l'autre casserait le XML.
    expect(xml).toContain("<Nm>Boulangerie Emile Fils</Nm>");
    const textes = [...xml.matchAll(/<(?:Nm|Ustrd)>([^<]*)</gu)].map((m) => m[1] ?? "");
    for (const texte of textes) {
      expect(texte).toMatch(/^[A-Za-z0-9/\-?:().,'+ ]*$/u);
    }
  });

  /**
   * `EndToEndId` est borné à 35 caractères. Un identifiant de société préfixé du
   * cycle dépasse et se fait tronquer — deux débiteurs partageraient alors la
   * même référence, et le fichier de retour deviendrait inexploitable.
   */
  it("garde des EndToEndId courts et distincts", () => {
    const ids = values(render(LINES, ALL_MANDATES), "EndToEndId");
    expect(ids).toEqual(["202609-B2B-001", "202609-B2B-002"]);
  });

  it("borne le libellé de remise à 140 caractères", () => {
    const long = { ...LINES[0]!, companyName: "A".repeat(200) };
    const xml = render([long], ALL_MANDATES);
    const ustrd = /<Ustrd>([^<]*)</u.exec(xml)?.[1] ?? "";
    expect(ustrd.length).toBeLessThanOrEqual(140);
  });
});

describe("renderPain008 — un fichier par schéma", () => {
  /**
   * Régression : jusqu'au 2026-09-15, le lot écrivait toutes les lignes sous le
   * schéma global `SEPA_SCHEME`. Un mandat signé en CORE partait en B2B, et la
   * banque du débiteur — qui n'a rien déclaré — rejetait le message entier.
   */
  it("un mandat CORE ne sort jamais dans le fichier B2B", () => {
    const b2b = render(LINES, MIXED_MANDATES, CREDITOR, "B2B");

    expect(b2b).not.toContain(TOMMEUSES.reference);
    expect(b2b).not.toContain(TOMMEUSES.iban);
    expect(values(b2b, "MndtId")).toEqual([ISERE.reference]);
    expect(values(b2b, "Cd").filter((cd) => cd === "CORE")).toEqual([]);
  });

  it("met chaque mandat dans le fichier de SON schéma, avec son LclInstrm", () => {
    const core = render(LINES, MIXED_MANDATES, CREDITOR, "CORE");
    const b2b = render(LINES, MIXED_MANDATES, CREDITOR, "B2B");

    expect(values(core, "MndtId")).toEqual([TOMMEUSES.reference]);
    expect(core).toContain("<LclInstrm><Cd>CORE</Cd></LclInstrm>");
    expect(core).toContain("<CtrlSum>1516.48</CtrlSum>");
    expect(b2b).toContain("<LclInstrm><Cd>B2B</Cd></LclInstrm>");
    expect(b2b).toContain("<CtrlSum>420.50</CtrlSum>");
  });

  /** Objection 4 : deux fichiers du même cycle ne partagent aucun identifiant. */
  it("donne aux deux fichiers des MsgId, PmtInfId et EndToEndId différents", () => {
    const core = render(LINES, MIXED_MANDATES, CREDITOR, "CORE");
    const b2b = render(LINES, MIXED_MANDATES, CREDITOR, "B2B");

    expect(values(core, "MsgId")).toEqual(["202609-CORE"]);
    expect(values(b2b, "MsgId")).toEqual(["202609-B2B"]);
    expect(values(core, "PmtInfId")).toEqual(["202609-CORE-RCUR"]);
    expect(values(core, "EndToEndId")).toEqual(["202609-CORE-001"]);
    expect(values(b2b, "EndToEndId")).toEqual(["202609-B2B-001"]);
  });

  it("tient les 35 caractères même dans le pire cas : brouillon, CORE, ponctuel", () => {
    const mandates = new Map([
      ["cmp_tommeuses", { ...TOMMEUSES, scheme: "CORE" as const, paymentType: "one_off" as const }],
    ]);
    const xml = render(LINES, mandates, CREDITOR, "CORE");

    expect(values(xml, "PmtInfId")).toEqual(["BROUILLON-202609-CORE-OOFF"]);
    for (const id of [
      ...values(xml, "MsgId"),
      ...values(xml, "PmtInfId"),
      ...values(xml, "EndToEndId"),
    ]) {
      expect(id.length).toBeLessThanOrEqual(35);
    }
  });

  it("rend les deux fichiers déposables quand tout le cycle est mandaté", () => {
    expect(render(LINES, MIXED_MANDATES, CREDITOR, "CORE")).not.toContain("BROUILLON");
    expect(render(LINES, MIXED_MANDATES, CREDITOR, "B2B")).not.toContain("BROUILLON");
  });

  /**
   * La vacuité du 2026-09-13, un cran plus bas : un cycle tout en B2B rendrait
   * sinon un fichier CORE vide, sans bandeau, prêt à déposer.
   */
  it("garde le bandeau d'un fichier VIDE, même quand le cycle est complet", () => {
    const core = render(LINES, ALL_MANDATES, CREDITOR, "CORE");

    expect(core).toContain("CE FICHIER NE PEUT PAS ETRE DEPOSE");
    expect(core).toContain("aucune ligne a prelever");
    expect(isSchemeFileDepositable(LINES, ALL_MANDATES, "CORE")).toBe(false);
    expect(isSchemeFileDepositable(LINES, ALL_MANDATES, "B2B")).toBe(true);
  });
});

describe("renderPain008 — une société sans mandat dans un cycle à deux schémas", () => {
  /**
   * 🔴 Objection 3. Calculé par fichier, chacun se serait dit complet en omettant
   * la société sans mandat. Elle retire le caractère déposable des DEUX, et
   * chaque bandeau la nomme.
   */
  it("retire le caractère déposable des deux fichiers, et chacun la nomme", () => {
    const partial = new Map([["cmp_tommeuses", { ...TOMMEUSES, scheme: "CORE" as const }]]);
    const withB2b: readonly BillableCompany[] = [
      ...LINES,
      { companyId: "cmp_b2b", companyName: "Refuge du Col", orderCount: 1, totalCents: 1_000 },
    ];
    const mandates = new Map([...partial, ["cmp_b2b", ISERE]]);

    for (const scheme of ["CORE", "B2B"] as const) {
      const xml = render(withB2b, mandates, CREDITOR, scheme);
      expect(xml).toContain(`<MsgId>BROUILLON-202609-${scheme}</MsgId>`);
      expect(xml).toContain("- Boulangerie Emile Fils");
      expect(isSchemeFileDepositable(withB2b, mandates, scheme)).toBe(false);
    }
    // La ligne mandatée reste dans son fichier : le brouillon se relit en entier.
    expect(render(withB2b, mandates, CREDITOR, "CORE")).toContain(TOMMEUSES.reference);
  });
});

describe("renderPain008 — la séquence suit le MANDAT", () => {
  /**
   * Un mandat récurrent sous une entité passée ponctuel reste `RCUR` : c'est la
   * case cochée sur son papier qui fait foi, pas le réglage courant.
   */
  it("écrit le SeqTp du mandat, et non celui de l'entité", () => {
    const oneOffEntity: CreditorSnapshot = { ...CREDITOR, mandatePaymentType: "one_off" };
    const xml = render(LINES, ALL_MANDATES, oneOffEntity);

    expect(values(xml, "SeqTp")).toEqual(["RCUR"]);
  });

  it("émet un bloc de paiement par séquence, chacun avec ses totaux", () => {
    const mandates = new Map([
      ["cmp_tommeuses", TOMMEUSES],
      ["cmp_isere", { ...ISERE, paymentType: "one_off" as const }],
    ]);
    const xml = render(LINES, mandates);

    expect(values(xml, "PmtInfId")).toEqual(["202609-B2B-RCUR", "202609-B2B-OOFF"]);
    expect(values(xml, "SeqTp")).toEqual(["RCUR", "OOFF"]);
    // Le groupe somme tout ; chaque bloc ne somme que les siens.
    expect(values(xml, "NbOfTxs")).toEqual(["2", "1", "1"]);
    expect(values(xml, "CtrlSum")).toEqual(["1936.98", "1516.48", "420.50"]);
    // Le rang court sur le fichier : deux blocs ne partagent pas une référence.
    expect(values(xml, "EndToEndId")).toEqual(["202609-B2B-001", "202609-B2B-002"]);
  });

  it("n'émet qu'un seul bloc quand une seule séquence est présente", () => {
    expect(render(LINES, ALL_MANDATES).match(/<PmtInf>/gu)).toHaveLength(1);
  });
});

describe("renderPain008 — la banque du débiteur", () => {
  it("écrit le BIC du RIB quand il est connu, NOTPROVIDED sinon", () => {
    const xml = render(LINES, ALL_MANDATES);

    expect(xml).toContain("<DbtrAgt><FinInstnId><BIC>BNPAFRPP</BIC></FinInstnId></DbtrAgt>");
    expect(xml).toContain(
      `<DbtrAgt><FinInstnId><Othr><Id>${BIC_NOT_PROVIDED}</Id></Othr></FinInstnId></DbtrAgt>`,
    );
  });
});

describe("cycleTagOf", () => {
  /**
   * 🔴 Régression. La borne haute du cycle est EXCLUSIVE : un cycle clos le 1er
   * octobre est celui de SEPTEMBRE. Étiqueter par l'instant de clôture donnait
   * `202610` dans le fichier et `2026-09` dans son nom — deux identifiants du
   * même fichier qui se contredisent, ce qu'on ne remarque qu'en les comparant
   * à la main.
   */
  it("désigne le mois COUVERT, pas celui de la clôture", () => {
    expect(cycleTagOf(CYCLE_END)).toBe("202609");
  });

  it("tient aussi au passage à l'heure d'hiver", () => {
    // Clôture du 1er novembre : minuit à Paris vaut 23h UTC, pas 22h.
    expect(cycleTagOf(new Date("2026-10-31T23:00:00.000Z"))).toBe("202610");
  });
});

describe("renderPain008 — quand le lot est complet", () => {
  it("écrit la VRAIE RUM et le VRAI IBAN du débiteur", () => {
    const xml = render(LINES, ALL_MANDATES);

    expect(xml).toContain("<MndtId>LFC-9P2X4B-260912-K7M3QT</MndtId>");
    expect(xml).toContain("<IBAN>FR7630004000031234567890143</IBAN>");
  });

  /**
   * 🔴 Le bandeau tombe SEULEMENT ici. C'est tout l'enjeu du fichier : un lot
   * partiellement vrai passe la relecture humaine, là où un lot entièrement
   * faux est refusé par le portail.
   */
  it("perd son bandeau et son préfixe BROUILLON", () => {
    const xml = render(LINES, ALL_MANDATES);

    expect(xml).not.toContain("BROUILLON");
  });

  it("porte le BIC du créancier — `CdtrAgt`, que la banque exige", () => {
    expect(render(LINES, ALL_MANDATES)).toContain(
      "<CdtrAgt><FinInstnId><BIC>CEPAFRPP751</BIC></FinInstnId></CdtrAgt>",
    );
  });
});

describe("renderPain008 — quand une seule ligne manque", () => {
  /**
   * Régression : une ligne incomplète parmi deux doit garder le fichier
   * indéposable ENTIER. Le contraire produirait un lot où une ligne réelle passe
   * pour le cycle complet — le pire des deux mondes, puisqu'il a l'air sérieux.
   */
  it("garde le bandeau pour TOUT le fichier", () => {
    const partial = new Map([["cmp_tommeuses", TOMMEUSES]]);

    const xml = render(LINES, partial);

    expect(xml).toContain("BROUILLON");
    expect(xml).toContain("- Boulangerie Emile Fils");
  });
});

describe("renderPain008 — ce qu'il refuse de produire", () => {
  /**
   * L'entité peut émettre des MANDATS sans BIC — le papier n'en porte pas. Le
   * refus est ici, au moment où la banque le réclame vraiment, et il nomme
   * l'entité plutôt que de laisser le portail rejeter sans dire quoi.
   */
  it("refuse quand l'entité émettrice n'a pas de BIC", () => {
    const sansBic: CreditorSnapshot = { ...CREDITOR, creditorBic: null };

    expect(() => render(LINES, ALL_MANDATES, sansBic)).toThrow(CreditorBicMissingError);
  });
});

describe("renderPain008 — le lot VIDE", () => {
  /**
   * 🔴 Régression trouvée en e2e le 2026-09-13, jamais par les unitaires.
   * `lines.every(...)` rend `true` sur un tableau vide : un cycle sans aucune
   * société à prélever sortait donc « complet », sans bandeau, avec `NbOfTxs` à
   * zéro. Un lot qui ne demande rien n'est pas un lot complet — c'est un lot
   * qui n'existe pas.
   */
  it("garde son bandeau — un lot qui ne demande rien n'est pas déposable", () => {
    const xml = render([], ALL_MANDATES);

    expect(xml).toContain("CE FICHIER NE PEUT PAS ETRE DEPOSE");
    expect(xml).toContain("BROUILLON");
  });

  it("le dit aussi par `isDepositable`, que le NOM du fichier consulte", () => {
    expect(isDepositable([], ALL_MANDATES)).toBe(false);
    expect(isDepositable(LINES, ALL_MANDATES)).toBe(true);
    expect(isDepositable(LINES, new Map())).toBe(false);
  });
});
