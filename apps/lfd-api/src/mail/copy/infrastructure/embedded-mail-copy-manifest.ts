import { MAIL_COPY } from "../../../platform/mailer/copy/mail-copy.js";
import manifestJson from "../../../platform/mailer/copy/mail-copy-manifest.json" with { type: "json" };
import {
  mailFamilyOf,
  mailFollowsLocale,
  mailKeys,
} from "../../../platform/mailer/specimens/mail-specimens.js";
import {
  mailLayouts,
  type MailSectionText,
} from "../../../platform/mailer/sections/mail-layouts.js";
import type { MailCopyLocale } from "../domain/mail-copy-locale.js";
import { MailCopyManifest, type MailCopyManifestEntry } from "../domain/mail-copy-manifest.js";
import type {
  MailLayoutDescription,
  MailSectionTextDescription,
} from "../domain/mail-section-layout.js";

/**
 * **Le dictionnaire des e-mails que cette API a compilé**, vu comme un
 * manifeste (plan `plan-textes-des-e-mails.md`, E1, E2).
 *
 * Le manifeste généré (`pnpm mail-copy:digest`, tenu par
 * `lint:mail-copy-digest`) donne pour chaque texte ses variables permises et
 * obligatoires ; les textes par défaut des trois langues se relisent dans le
 * dictionnaire lui-même, d'où le manifeste est tiré. Les sections de chaque
 * e-mail (E4) se lisent dans leurs déclarations (`platform/mailer/sections/`).
 */
export function embeddedMailCopyManifest(
  rewrites: readonly MailDefaultRewrite[] = [],
): MailCopyManifest {
  const entries: MailCopyManifestEntry[] = Object.entries(manifestJson.mails).flatMap(
    ([mail, texts]) =>
      Object.entries(texts).map(([path, text]) => ({
        mail,
        path,
        defaults: rewritten(rewrites, mail, path, {
          fr: text.fr,
          en: defaultOf("en", mail, path) ?? text.fr,
          it: defaultOf("it", mail, path) ?? text.fr,
        }),
        allowed: [...new Set<string>(text.variables)].sort(),
        required: [...new Set<string>(text.required)].sort(),
      })),
  );
  const mails = mailKeys().map((mail) => ({
    mail,
    family: mailFamilyOf(mail),
    followsLocale: mailFollowsLocale(mail),
  }));
  return MailCopyManifest.of(entries, mails, embeddedLayouts());
}

/**
 * Un texte du code réécrit — pour simuler, dans un e2e, le déploiement d'après
 * (« le texte d'origine a changé depuis ») sans toucher au dictionnaire.
 */
export interface MailDefaultRewrite {
  readonly mail: string;
  readonly path: string;
  readonly locale: MailCopyLocale;
  readonly text: string;
}

function rewritten(
  rewrites: readonly MailDefaultRewrite[],
  mail: string,
  path: string,
  defaults: Readonly<Record<MailCopyLocale, string>>,
): Readonly<Record<MailCopyLocale, string>> {
  return rewrites
    .filter((rewrite) => rewrite.mail === mail && rewrite.path === path)
    .reduce((acc, rewrite) => ({ ...acc, [rewrite.locale]: rewrite.text }), defaults);
}

/** Les sections déclarées de chaque e-mail, dans la langue du domaine. */
function embeddedLayouts(): readonly MailLayoutDescription[] {
  const described = (texts: readonly MailSectionText[]): readonly MailSectionTextDescription[] =>
    texts.map((text) => ({ path: text.path, variant: text.variant ?? null }));
  return mailLayouts().map((layout) => ({
    mail: layout.mail,
    subject: described(layout.subject),
    header: described(layout.header),
    sections: layout.sections.map((section) => ({
      id: section.id,
      label: section.label,
      nature: section.nature,
      texts: described(section.texts),
    })),
  }));
}

/** Le texte du code au bout d'un chemin, dans une langue — `null` s'il n'y en a pas. */
function defaultOf(locale: "en" | "it", mail: string, path: string): string | null {
  let node: unknown = Reflect.get(MAIL_COPY[locale], mail);
  for (const segment of path.split(".")) {
    node = typeof node === "object" && node !== null ? Reflect.get(node, segment) : undefined;
  }
  return typeof node === "string" ? node : null;
}
