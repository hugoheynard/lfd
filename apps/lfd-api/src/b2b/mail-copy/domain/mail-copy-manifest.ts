import type { MailCopyLocale } from "./mail-copy-locale.js";

/** Un texte d'un e-mail, tel que le code le déclare. */
export interface MailCopyManifestEntry {
  /** La clé du registre (`customer.order-placed`). */
  readonly mail: string;
  /** Le chemin du texte dans la section de l'e-mail (`subject`, `title.paid`). */
  readonly path: string;
  /** Le texte du code, dans chaque langue. */
  readonly defaults: Readonly<Record<MailCopyLocale, string>>;
  /** Les `{variables}` que le gabarit fournit à ce texte — les seules permises. */
  readonly allowed: readonly string[];
  /** Celles que le texte français par défaut porte — qu'aucun texte ne peut perdre. */
  readonly required: readonly string[];
}

/** Le moment d'un e-mail (C8) — la famille de son dictionnaire. */
export type MailFamily = "order" | "payment" | "billing" | "account" | "team";

/** À qui il s'adresse (C8) : lu du préfixe de sa clé au registre. */
export type MailAudience = "customer" | "team" | "agency";

/** Un e-mail du registre, tel que l'écran le range. */
export interface MailDescription {
  readonly mail: string;
  readonly family: MailFamily;
  /** Part-il dans la langue du destinataire, ou toujours en français ? */
  readonly followsLocale: boolean;
}

/** `customer.*` au client, `agency.*` à l'agence, le reste (`staff.*`, `ops.*`) à l'équipe. */
export function audienceOf(mail: string): MailAudience {
  if (mail.startsWith("customer.")) {
    return "customer";
  }
  return mail.startsWith("agency.") ? "agency" : "team";
}

/**
 * **Les textes des e-mails que cette API a compilés** (plan
 * `plan-textes-des-e-mails.md`, E1 et E2) — la référence de toute validation.
 *
 * Un texte en base que le manifeste ne connaît pas est orphelin : montré,
 * jamais publié ni envoyé.
 */
export class MailCopyManifest {
  private readonly byId: ReadonlyMap<string, MailCopyManifestEntry>;

  private constructor(
    private readonly ordered: readonly MailCopyManifestEntry[],
    private readonly described: readonly MailDescription[],
  ) {
    this.byId = new Map(ordered.map((entry) => [idOf(entry.mail, entry.path), entry]));
  }

  /** `mails` : chaque e-mail du registre, dans l'ordre où l'écran les range. */
  static of(
    entries: readonly MailCopyManifestEntry[],
    mails: readonly MailDescription[],
  ): MailCopyManifest {
    return new MailCopyManifest(entries, mails);
  }

  entry(mail: string, path: string): MailCopyManifestEntry | null {
    return this.byId.get(idOf(mail, path)) ?? null;
  }

  knows(mail: string, path: string): boolean {
    return this.byId.has(idOf(mail, path));
  }

  /** Les textes dans l'ordre du dictionnaire, e-mail par e-mail. */
  entries(): readonly MailCopyManifestEntry[] {
    return this.ordered;
  }

  /** Les e-mails du registre, dans l'ordre où l'écran les range. */
  mails(): readonly MailDescription[] {
    return this.described;
  }

  /** L'e-mail est-il au registre ? */
  hasMail(mail: string): boolean {
    return this.described.some((described) => described.mail === mail);
  }

  /** Les textes d'un e-mail, dans l'ordre du dictionnaire. */
  textsOf(mail: string): readonly MailCopyManifestEntry[] {
    return this.ordered.filter((entry) => entry.mail === mail);
  }
}

/** Un e-mail et un chemin, en une clé de table — le `|` n'apparaît dans aucun des deux. */
export function idOf(mail: string, path: string): string {
  return `${mail}|${path}`;
}
