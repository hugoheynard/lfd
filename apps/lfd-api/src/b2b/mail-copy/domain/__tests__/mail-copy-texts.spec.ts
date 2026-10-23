import type { MailCopyEntryState } from "../mail-copy-entry.js";
import { staleMailTranslations } from "../mail-copy-staleness.js";
import { replacementTexts } from "../mail-copy-texts.js";
import { KICKER, MANIFEST, SUBJECT } from "./mail-copy-fixtures.js";

function state(partial: Partial<MailCopyEntryState>): MailCopyEntryState {
  return {
    mail: SUBJECT.mail,
    path: SUBJECT.path,
    locale: "fr",
    revision: 1,
    draft: { state: "unchanged" },
    drafted: null,
    publishedText: null,
    published: null,
    ...partial,
  };
}

describe("les textes qui remplacent ceux du code", () => {
  const STATES = [
    state({ publishedText: "Publié {ref}", draft: { state: "set", text: "Brouillon {ref}" } }),
    state({ path: KICKER.path, publishedText: "Faite", draft: { state: "reset" } }),
    state({ locale: "en", publishedText: "Published {ref}" }),
    state({ path: "retire.du.code", publishedText: "orphelin" }),
  ];

  it("publié : ce qui part aujourd'hui, dans la langue demandée, sans orpheline", () => {
    expect(replacementTexts(STATES, MANIFEST, "fr", "published")).toEqual({
      [SUBJECT.mail]: { subject: "Publié {ref}", kicker: "Faite" },
    });
    expect(replacementTexts(STATES, MANIFEST, "it", "published")).toEqual({});
  });

  it("brouillon : le texte en cours, le défaut pour un « rétablir », le publié sinon", () => {
    expect(replacementTexts(STATES, MANIFEST, "fr", "draft")).toEqual({
      [SUBJECT.mail]: { subject: "Brouillon {ref}" },
    });
    expect(replacementTexts(STATES, MANIFEST, "en", "draft")).toEqual({
      [SUBJECT.mail]: { subject: "Published {ref}" },
    });
  });

  /**
   * Un texte publié AVANT qu'une variable devienne obligatoire ne part pas
   * sans elle : le défaut prend sa place.
   */
  it("écarte un publié qui ne tient plus les variables du code", () => {
    expect(
      replacementTexts([state({ publishedText: "Sans numéro" })], MANIFEST, "fr", "published"),
    ).toEqual({});
  });
});

describe("les traductions en retard (C4)", () => {
  it("signale celles touchées avant le français, ou jamais", () => {
    expect(staleMailTranslations({ fr: null })).toEqual([]);
    expect(
      staleMailTranslations({ fr: new Date(60_000), en: new Date(0), it: new Date(120_000) }),
    ).toEqual(["en"]);
    expect(staleMailTranslations({ fr: new Date(0) })).toEqual(["en", "it"]);
  });
});
