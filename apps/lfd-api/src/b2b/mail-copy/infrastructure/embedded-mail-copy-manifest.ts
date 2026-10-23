import { MAIL_COPY } from "../../../platform/mailer/copy/mail-copy.js";
import manifestJson from "../../../platform/mailer/copy/mail-copy-manifest.json" with { type: "json" };
import {
  mailFamilyOf,
  mailFollowsLocale,
  mailKeys,
} from "../../../platform/mailer/specimens/mail-specimens.js";
import { MailCopyManifest, type MailCopyManifestEntry } from "../domain/mail-copy-manifest.js";

/**
 * **Le dictionnaire des e-mails que cette API a compilé**, vu comme un
 * manifeste (plan `plan-textes-des-e-mails.md`, E1, E2).
 *
 * Le manifeste généré (`pnpm mail-copy:digest`, tenu par
 * `lint:mail-copy-digest`) donne pour chaque texte ses variables permises et
 * obligatoires ; les textes par défaut des trois langues se relisent dans le
 * dictionnaire lui-même, d'où le manifeste est tiré.
 */
export function embeddedMailCopyManifest(): MailCopyManifest {
  const entries: MailCopyManifestEntry[] = Object.entries(manifestJson.mails).flatMap(
    ([mail, texts]) =>
      Object.entries(texts).map(([path, text]) => ({
        mail,
        path,
        defaults: {
          fr: text.fr,
          en: defaultOf("en", mail, path) ?? text.fr,
          it: defaultOf("it", mail, path) ?? text.fr,
        },
        allowed: [...new Set<string>(text.variables)].sort(),
        required: [...new Set<string>(text.required)].sort(),
      })),
  );
  const mails = mailKeys().map((mail) => ({
    mail,
    family: mailFamilyOf(mail),
    followsLocale: mailFollowsLocale(mail),
  }));
  return MailCopyManifest.of(entries, mails);
}

/** Le texte du code au bout d'un chemin, dans une langue — `null` s'il n'y en a pas. */
function defaultOf(locale: "en" | "it", mail: string, path: string): string | null {
  let node: unknown = Reflect.get(MAIL_COPY[locale], mail);
  for (const segment of path.split(".")) {
    node = typeof node === "object" && node !== null ? Reflect.get(node, segment) : undefined;
  }
  return typeof node === "string" ? node : null;
}
