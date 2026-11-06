import { defaultChangedSince } from "../mail-copy-default-drift.js";
import { MailCopyEntry } from "../mail-copy-entry.js";
import { MailCopyManifest } from "../mail-copy-manifest.js";
import { KICKER, MANIFEST, SUBJECT, TITLE, stamp } from "./mail-copy-fixtures.js";

const AT = new Date(0);
const OLD_DEFAULT = SUBJECT.defaults.fr;
const NEW_DEFAULT = "Commande {ref} confirmée";

/** Le même dictionnaire, le texte français de l'objet réécrit dans le code. */
const REWRITTEN = MailCopyManifest.of(
  [{ ...SUBJECT, defaults: { ...SUBJECT.defaults, fr: NEW_DEFAULT } }, KICKER, TITLE],
  MANIFEST.mails(),
);

function drafted(): MailCopyEntry {
  const entry = MailCopyEntry.untouched(SUBJECT.mail, SUBJECT.path, "fr");
  entry.draft("Merci pour {ref}", MANIFEST, 0, stamp(AT));
  return entry;
}

describe("le texte d'origine noté par l'agrégat", () => {
  it("note le texte du code de la langue au brouillon, l'oublie à « rétablir »", () => {
    const entry = drafted();
    expect(entry.snapshot().draftDefault).toBe(OLD_DEFAULT);
    entry.reset(1, stamp(AT));
    expect(entry.snapshot().draftDefault).toBeNull();
  });

  it("note le texte du code COURANT à la publication, pas celui du brouillon", () => {
    const entry = drafted();
    entry.publish(REWRITTEN, stamp(AT));
    expect(entry.snapshot()).toMatchObject({ draftDefault: null, publishedDefault: NEW_DEFAULT });
  });

  it("publier un « rétablir » ne garde aucun texte d'origine", () => {
    const entry = drafted();
    entry.publish(MANIFEST, stamp(AT));
    entry.reset(1, stamp(AT));
    entry.publish(MANIFEST, stamp(AT));
    expect(entry.snapshot().publishedDefault).toBeNull();
  });
});

describe("le signal « le texte d'origine a changé »", () => {
  it("se tait tant que le texte du code n'a pas bougé", () => {
    expect(defaultChangedSince(drafted().snapshot(), OLD_DEFAULT)).toBeNull();
  });

  it("rend le texte d'origine d'un brouillon quand le code l'a réécrit", () => {
    expect(defaultChangedSince(drafted().snapshot(), NEW_DEFAULT)).toBe(OLD_DEFAULT);
  });

  it("rend celui du publié quand rien n'attend, et disparaît à la republication", () => {
    const entry = drafted();
    entry.publish(MANIFEST, stamp(AT));
    expect(defaultChangedSince(entry.snapshot(), NEW_DEFAULT)).toBe(OLD_DEFAULT);

    entry.draft("Merci pour {ref}", REWRITTEN, 1, stamp(AT));
    expect(defaultChangedSince(entry.snapshot(), NEW_DEFAULT)).toBeNull();
    entry.publish(REWRITTEN, stamp(AT));
    expect(defaultChangedSince(entry.snapshot(), NEW_DEFAULT)).toBeNull();
  });

  it("disparaît dès « rétablir », avant même la publication", () => {
    const entry = drafted();
    entry.publish(MANIFEST, stamp(AT));
    entry.reset(1, stamp(AT));
    expect(defaultChangedSince(entry.snapshot(), NEW_DEFAULT)).toBeNull();
  });

  it("se tait sur un texte d'origine inconnu, une orpheline, un texte jamais touché", () => {
    const entry = drafted();
    entry.publish(MANIFEST, stamp(AT));
    const unknown = { ...entry.snapshot(), publishedDefault: null };
    expect(defaultChangedSince(unknown, NEW_DEFAULT)).toBeNull();
    expect(defaultChangedSince(entry.snapshot(), null)).toBeNull();
    expect(defaultChangedSince(null, NEW_DEFAULT)).toBeNull();
  });
});
