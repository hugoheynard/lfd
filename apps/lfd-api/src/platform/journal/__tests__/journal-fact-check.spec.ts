import { JournalFactCheck, JournalFactNotCataloguedError } from "../journal-fact-check.js";

/**
 * La vérification à l'écriture, dans ses deux modes (D2 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`) : stricte sous les
 * harnais de test, indulgente en production — où l'écart se signale et le fait
 * s'écrit quand même.
 */
function lenient(): { readonly check: JournalFactCheck; readonly reported: string[] } {
  const reported: string[] = [];
  return { check: new JournalFactCheck(false, (message) => reported.push(message)), reported };
}

// La forme courante depuis le lot B du plan des phrases : le nom de la société figé.
const CONFORM = { subjectLabel: "Le Pain Quotidien", fileName: "kbis.pdf" };

describe("JournalFactCheck — strict", () => {
  const strict = new JournalFactCheck(true, () => {
    throw new Error("le mode strict ne signale pas : il lève");
  });

  it("laisse passer un fait conforme", () => {
    expect(() => strict.verify("company.kbis_uploaded", CONFORM)).not.toThrow();
  });

  it("refuse un type inconnu, en le nommant", () => {
    expect(() => strict.verify("company.teleported", CONFORM)).toThrow(
      JournalFactNotCataloguedError,
    );
    expect(() => strict.verify("company.teleported", CONFORM)).toThrow(/company\.teleported/);
  });

  it("refuse un type retiré : il ne s'écrit plus", () => {
    expect(() => strict.verify("company.kbis_uploaded_by_staff", CONFORM)).toThrow(/retiré/);
  });

  it("refuse une charge non conforme, en nommant la clé fautive", () => {
    expect(() => strict.verify("company.kbis_uploaded", {})).toThrow(/fileName/);
  });

  it("refuse une clé que le catalogue ne décrit pas — rien ne se perd", () => {
    expect(() => strict.verify("company.kbis_uploaded", { ...CONFORM, iban: "FR76…" })).toThrow(
      /iban/,
    );
  });
});

describe("JournalFactCheck — indulgent (production)", () => {
  it("ne signale rien pour un fait conforme", () => {
    const { check, reported } = lenient();

    check.verify("company.kbis_uploaded", CONFORM);

    expect(reported).toEqual([]);
  });

  it("signale un type inconnu, sans lever", () => {
    const { check, reported } = lenient();

    expect(() => check.verify("company.teleported", CONFORM)).not.toThrow();
    expect(reported).toEqual([expect.stringMatching(/company\.teleported/)]);
  });

  it("signale une charge non conforme, en nommant la clé, sans lever", () => {
    const { check, reported } = lenient();

    expect(() => check.verify("company.kbis_uploaded", { fileName: 42 })).not.toThrow();
    expect(reported).toEqual([expect.stringMatching(/fileName/)]);
  });
});
