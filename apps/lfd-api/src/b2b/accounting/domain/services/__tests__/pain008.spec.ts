import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { BillableCompany } from "../../ports/billable-orders.reader.js";
import { cycleTagOf, renderPain008, UNKNOWN_IBAN, UNKNOWN_MANDATE } from "../pain008.js";
import { CreditorBicMissingError } from "../../errors/accounting-errors.js";
import type { DebtorMandate } from "../../ports/debtor-mandate.reader.js";

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
  // Zones 20 et 12 du mandat. Le `pain.008` ne les lit pas — elles vivent sur le
  // papier, pas dans le lot — mais elles appartiennent au snapshot de l'émetteur,
  // donc la fixture les porte plutôt que de mentir sur sa forme.
  mandateContractDescription: "Fourniture de pains et viennoiseries",
  mandatePaymentType: "recurrent",
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

function render(
  lines: readonly BillableCompany[] = LINES,
  mandates: ReadonlyMap<string, DebtorMandate> = new Map(),
  creditor: CreditorSnapshot = CREDITOR,
): string {
  return renderPain008({
    creditor,
    cycleStart: CYCLE_START,
    cycleEnd: CYCLE_END,
    createdAt: CREATED_AT,
    mandates,
    lines,
  });
}

/** Les deux lignes, toutes deux prélevables. */
const ALL_MANDATES = new Map<string, DebtorMandate>([
  ["cmp_tommeuses", { reference: "LFC-9P2X4B-260912-K7M3QT", iban: "FR7630004000031234567890143" }],
  ["cmp_isere", { reference: "LFC-7K2M4P-260912-B4X9RD", iban: "FR7612548029980123456789161" }],
]);

describe("renderPain008 — le brouillon, et ce qui le rend indéposable", () => {
  /**
   * 🔴 Le test qui compte le plus. Un lot incomplet qui RESSEMBLE à un lot
   * valide est exactement ce qui finit déposé un vendredi soir. L'IBAN débiteur
   * n'existe pas dans le système, et le rendu écrit à sa place un marqueur
   * qu'aucun motif d'IBAN n'accepte — plutôt qu'une valeur plausible.
   */
  it("écrit des marqueurs qu'aucun schéma n'accepte, jamais de faux plausibles", () => {
    const xml = render();

    expect(xml).toContain(`<IBAN>${UNKNOWN_IBAN}</IBAN>`);
    expect(xml).toContain(`<MndtId>${UNKNOWN_MANDATE}</MndtId>`);
    // Le motif d'un IBAN selon le schéma ISO : deux lettres, deux chiffres, puis
    // l'identifiant. Le marqueur DOIT échouer — c'est ce qui protège.
    expect(UNKNOWN_IBAN).not.toMatch(/^[A-Z]{2}\d{2}[A-Za-z0-9]{1,30}$/u);
  });

  it("porte l'avertissement dans l'en-tête ET dans l'identifiant du message", () => {
    const xml = render();
    expect(xml).toContain("CE FICHIER NE PEUT PAS ETRE DEPOSE");
    expect(xml).toContain("<MsgId>BROUILLON-202609</MsgId>");
  });

  it("rend les MÊMES octets deux fois — sans quoi rien n'est comparable", () => {
    expect(render()).toBe(render());
  });
});

describe("renderPain008 — ce qui fait rejeter un lot", () => {
  it("fait tomber juste NbOfTxs et CtrlSum, aux DEUX niveaux", () => {
    const xml = render();
    // 151648 + 42050 = 193698 centimes.
    expect(xml.match(/<NbOfTxs>2<\/NbOfTxs>/gu)).toHaveLength(2);
    expect(xml.match(/<CtrlSum>1936\.98<\/CtrlSum>/gu)).toHaveLength(2);
  });

  it("écrit les montants au point décimal, deux décimales, toujours", () => {
    const xml = render([{ ...LINES[0]!, totalCents: 500 }]);
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
    const xml = render();
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
    const ids = [...render().matchAll(/<EndToEndId>([^<]+)</gu)].map((m) => m[1] ?? "");
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(35);
    }
  });

  it("borne le libellé de remise à 140 caractères", () => {
    const long = { ...LINES[0]!, companyName: "A".repeat(200) };
    const xml = render([long]);
    const ustrd = /<Ustrd>([^<]*)</u.exec(xml)?.[1] ?? "";
    expect(ustrd.length).toBeLessThanOrEqual(140);
  });

  /** Un seul `PmtInf` tant qu'une seule séquence : deux mélangés = lot rejeté. */
  it("n'émet qu'un seul bloc de paiement", () => {
    expect(render().match(/<PmtInf>/gu)).toHaveLength(1);
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
    expect(xml).not.toContain(UNKNOWN_IBAN);
    expect(xml).not.toContain(UNKNOWN_MANDATE);
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
   * indéposable ENTIER. Le contraire produirait un lot où un vrai IBAN côtoie
   * un marqueur — le pire des deux mondes, puisqu'il a l'air sérieux.
   */
  it("garde le bandeau pour TOUT le fichier", () => {
    const partial = new Map([["cmp_tommeuses", ALL_MANDATES.get("cmp_tommeuses")!]]);

    const xml = render(LINES, partial);

    expect(xml).toContain("BROUILLON");
    expect(xml).toContain(UNKNOWN_IBAN);
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
