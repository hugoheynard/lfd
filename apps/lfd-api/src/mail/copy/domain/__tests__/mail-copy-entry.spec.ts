import { MailCopyEntry } from "../mail-copy-entry.js";
import {
  InvalidMailTextError,
  MailCopyChangedError,
  UnknownMailTextError,
} from "../mail-copy-errors.js";
import { MailCopyManifest } from "../mail-copy-manifest.js";
import { MANIFEST, SUBJECT, stamp } from "./mail-copy-fixtures.js";

const AT = new Date(0);

function subject(): MailCopyEntry {
  return MailCopyEntry.untouched(SUBJECT.mail, SUBJECT.path, "fr");
}

describe("un texte d'e-mail en brouillon", () => {
  it("écrit le brouillon, monte la révision et garde l'auteur", () => {
    const entry = subject();
    entry.draft("Merci pour {ref}", MANIFEST, 0, stamp(AT));
    expect(entry.snapshot()).toMatchObject({
      revision: 1,
      draft: { state: "set", text: "Merci pour {ref}" },
      drafted: { at: AT, staffId: "fiche-colette" },
      publishedText: null,
    });
  });

  it("refuse une révision dépassée, un texte inconnu, une variable perdue", () => {
    const entry = subject();
    expect(() => entry.draft("{ref}", MANIFEST, 3, stamp(AT))).toThrow(MailCopyChangedError);
    expect(() =>
      MailCopyEntry.untouched("customer.order-placed", "pas.un.texte", "fr").draft(
        "x",
        MANIFEST,
        0,
        stamp(AT),
      ),
    ).toThrow(UnknownMailTextError);
    expect(() => entry.draft("sans numéro", MANIFEST, 0, stamp(AT))).toThrow(InvalidMailTextError);
    expect(entry.snapshot().revision).toBe(0);
  });

  it("rétablir sans rien de publié abandonne le brouillon ; avec un publié, le retire à « Publier »", () => {
    const entry = subject();
    entry.draft("Merci {ref}", MANIFEST, 0, stamp(AT));
    entry.reset(1, stamp(AT));
    expect(entry.snapshot().draft).toEqual({ state: "unchanged" });

    entry.draft("Merci {ref}", MANIFEST, 2, stamp(AT));
    expect(entry.publish(MANIFEST, stamp(AT))).toEqual({
      mail: SUBJECT.mail,
      path: SUBJECT.path,
      locale: "fr",
      before: null,
      after: "Merci {ref}",
    });
    entry.reset(3, stamp(AT));
    expect(entry.snapshot().draft).toEqual({ state: "reset" });
    expect(entry.publish(MANIFEST, stamp(AT))).toMatchObject({
      before: "Merci {ref}",
      after: null,
    });
    expect(entry.snapshot().publishedText).toBeNull();
  });

  it("ne publie jamais une orpheline, et ne dit rien d'un brouillon égal au publié", () => {
    const entry = subject();
    entry.draft("Merci {ref}", MANIFEST, 0, stamp(AT));
    expect(entry.publish(MailCopyManifest.of([], []), stamp(AT))).toBeNull();
    expect(entry.snapshot().draft.state).toBe("set");

    entry.publish(MANIFEST, stamp(AT));
    entry.draft("Merci {ref}", MANIFEST, 1, stamp(AT));
    expect(entry.publish(MANIFEST, stamp(AT))).toBeNull();
  });
});
