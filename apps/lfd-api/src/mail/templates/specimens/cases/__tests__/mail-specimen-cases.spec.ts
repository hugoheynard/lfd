import { b2bMailTemplates, type B2bMails } from "../../../mail-templates.js";
import { mailBlockDeclarationOf } from "../../../sections/mail-block-declarations.js";
import { mailKeys, renderMailData } from "../../mail-specimens.js";
import { SPECIMEN_MARK, SPECIMEN_URL } from "../../mail-specimen.types.js";
import { SPECIMEN_CASE_ID, type MailCaseTable } from "../mail-specimen-case.types.js";
import {
  MAIL_CASE_TABLES,
  mailCaseDataOf,
  mailCaseTableOf,
  mailCasesOf,
} from "../mail-specimen-cases.js";

/**
 * La garde du lot S4d (plan `plan-editeur-par-blocs.md`, § 16) : aucun e-mail
 * sans cas, aucun axe sans un cas qui l'exerce, et des données lisibles comme
 * inventées.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

/** Les valeurs d'axe que les cas d'un e-mail exercent réellement, lues sur leurs données. */
function exercised<K extends keyof B2bMails>(table: MailCaseTable<K>): readonly string[] {
  return table.axes.flatMap((axis) =>
    table.cases.map((candidate) => `${axis.id}=${axis.of(candidate.data("fr"))}`),
  );
}

function declared<K extends keyof B2bMails>(table: MailCaseTable<K>): readonly string[] {
  return table.axes.flatMap((axis) => axis.values.map((value) => `${axis.id}=${value}`));
}

function casesOf(mail: keyof B2bMails): readonly (readonly [keyof B2bMails, string])[] {
  return mailCasesOf(mail).map(({ id }) => [mail, id] as const);
}

describe("les cas des e-mails (S4d)", () => {
  it("couvrent chaque e-mail du registre, l'exemple en premier", () => {
    expect(Object.keys(MAIL_CASE_TABLES).sort()).toEqual(Object.keys(REGISTRY).sort());
    for (const mail of mailKeys()) {
      const ids = mailCasesOf(mail).map(({ id }) => id);
      expect(ids[0]).toBe(SPECIMEN_CASE_ID);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it.each(mailKeys())("« %s » : chaque valeur de chaque axe a un cas qui l'exerce", (mail) => {
    const table = mailCaseTableOf(mail);
    const seen = new Set(exercised(table));
    expect(declared(table).filter((value) => !seen.has(value))).toEqual([]);
    // Un cas hors des valeurs déclarées : l'axe ne dit pas tout ce que le gabarit distingue.
    expect([...seen].filter((value) => !declared(table).includes(value))).toEqual([]);
  });

  it.each(mailKeys().flatMap(casesOf))(
    "« %s », cas « %s » : se rend par son vrai gabarit, sur des données inventées",
    (mail, id) => {
      const data = mailCaseDataOf(mail, id, "fr");
      expect(data).not.toBeNull();
      if (data === null) {
        return;
      }
      const rendered = renderMailData(REGISTRY, mail, data, {});
      expect(rendered.html).toContain("<html");
      expect(JSON.stringify(data)).not.toMatch(/lfc\.test|example\.test|ORD-\d/u);
      if (id !== SPECIMEN_CASE_ID) {
        const specimen = mailCaseDataOf(mail, SPECIMEN_CASE_ID, "fr");
        expect(specimen === null ? "" : renderMailData(REGISTRY, mail, specimen, {}).html).not.toBe(
          rendered.html,
        );
      }
      // Ce qui désigne quelqu'un ou mène quelque part dit « EXEMPLE » — sauf un cas « sans
      // prénom » qui ne porte plus personne.
      if (id !== "anonymous") {
        expect(JSON.stringify(data)).toMatch(new RegExp(`${SPECIMEN_MARK}|${SPECIMEN_URL}`, "u"));
      }
    },
  );

  it.each(mailKeys())(
    "« %s » : un seul cas et des phrases bornées vont ensemble (§ 23)",
    (mail) => {
      const table = mailCaseTableOf(mail);
      const bounded = mailBlockDeclarationOf(mail).editablePhrases !== undefined;
      expect({ mail, bounded }).toEqual({ mail, bounded: table.axesInSystemBlocks !== undefined });
      if (table.axesInSystemBlocks !== undefined) {
        expect(table.cases).toHaveLength(1);
        // Un axe ne se déclare pas des deux côtés : il exige un cas, ou il n'en exige pas.
        const free = new Set(table.axesInSystemBlocks.map((axis) => axis.id));
        expect(table.axes.filter((axis) => free.has(axis.id))).toEqual([]);
      }
    },
  );

  it("ne rend aucun cas qu'un e-mail n'a pas", () => {
    expect(mailCaseDataOf("customer.order-placed", "inconnu", "fr")).toBeNull();
  });
});
