import { MailCopyEntry } from "../mail-copy-entry.js";
import { NothingToPublishError } from "../mail-copy-errors.js";
import { MailCopyRelease } from "../mail-copy-release.js";
import { KICKER, MANIFEST, SUBJECT, stamp } from "./mail-copy-fixtures.js";

const AT = new Date(0);

describe("une publication des textes des e-mails", () => {
  it("applique les brouillons, monte la version et rend ce qui change", () => {
    const subject = MailCopyEntry.untouched(SUBJECT.mail, SUBJECT.path, "fr");
    subject.draft("Merci {ref}", MANIFEST, 0, stamp(AT));
    const release = MailCopyRelease.of(4, [subject]);

    const changes = release.publish(MANIFEST, stamp(AT));

    expect(release.expectedVersion).toBe(4);
    expect(release.version).toBe(5);
    expect(changes).toEqual({
      texts: [
        {
          mail: SUBJECT.mail,
          path: SUBJECT.path,
          locale: "fr",
          before: null,
          after: "Merci {ref}",
        },
      ],
      sectionOrders: [],
    });
  });

  it("refuse sans brouillon publiable — une orpheline seule n'en est pas un", () => {
    expect(() => MailCopyRelease.of(0, []).publish(MANIFEST, stamp(AT))).toThrow(
      NothingToPublishError,
    );
    const orphan = MailCopyEntry.reconstitute({
      mail: KICKER.mail,
      path: "retire.du.code",
      locale: "fr",
      revision: 1,
      draft: { state: "set", text: "x" },
      drafted: stamp(AT),
      publishedText: null,
      published: null,
      draftDefault: null,
      publishedDefault: null,
    });
    const release = MailCopyRelease.of(0, [orphan]);
    expect(() => release.publish(MANIFEST, stamp(AT))).toThrow(NothingToPublishError);
    expect(release.version).toBe(0);
  });
});
