import {
  KICKER,
  MANIFEST,
  SUBJECT,
  TITLE,
  stamp,
} from "../../domain/__tests__/mail-copy-fixtures.js";
import type { MailCopyEntryState } from "../../domain/mail-copy-entry.js";
import { mailCopyAdminView } from "../mail-copy-admin-view.js";

const NONE = { version: 0, publishedAt: null, publishedBy: null };

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

describe("l'écran des textes des e-mails", () => {
  it("range chaque e-mail, ses textes et leur défaut dans les trois langues", () => {
    const view = mailCopyAdminView(MANIFEST, [], NONE);

    expect(
      view.mails.map((mail) => [mail.mail, mail.audience, mail.family, mail.followsLocale]),
    ).toEqual([
      [SUBJECT.mail, "customer", "order", true],
      [TITLE.mail, "customer", "account", false],
    ]);
    expect(view.mails[0]?.texts.map((text) => text.path)).toEqual([SUBJECT.path, KICKER.path]);
    expect(view.mails[0]?.texts[0]).toMatchObject({
      variables: ["ref"],
      requiredVariables: ["ref"],
      staleTranslations: [],
    });
    expect(view.mails[0]?.texts[0]?.locales.it).toEqual({
      default: "Il suo ordine {ref}",
      draftState: "unchanged",
      draftText: null,
      publishedText: null,
      revision: 0,
      draftAt: null,
      draftBy: null,
    });
    expect(view.pendingCount).toBe(0);
  });

  it("compte ce qui attend, signale le français changé, et montre les orphelines à part", () => {
    const view = mailCopyAdminView(
      MANIFEST,
      [
        state({ draft: { state: "set", text: "Merci {ref}" }, drafted: stamp(new Date(60_000)) }),
        state({ locale: "en", drafted: stamp(new Date(0)) }),
        state({ path: "retire.du.code", publishedText: "ancien" }),
      ],
      { version: 3, publishedAt: new Date(0), publishedBy: "fiche-colette" },
    );

    expect(view.version).toBe(3);
    expect(view.publishedAt).toBe(new Date(0).toISOString());
    expect(view.pendingCount).toBe(1);
    expect(view.mails[0]?.pendingCount).toBe(1);
    expect(view.mails[0]?.texts[0]?.staleTranslations).toEqual(["en", "it"]);
    expect(view.mails[0]?.texts[0]?.locales.fr.draftText).toBe("Merci {ref}");
    expect(view.orphans).toHaveLength(1);
    expect(view.orphans[0]).toMatchObject({
      mail: SUBJECT.mail,
      path: "retire.du.code",
      variables: [],
    });
    expect(view.orphans[0]?.locales.fr).toMatchObject({ default: null, publishedText: "ancien" });
  });
});
