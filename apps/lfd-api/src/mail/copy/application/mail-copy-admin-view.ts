import type {
  MailCopyAdminView,
  MailCopyDefaultChangeView,
  MailCopyLocaleView,
  MailCopyMailView,
  MailCopyTextView,
} from "@lfd/contracts";

import type { MailCopyPublicationState } from "../domain/ports/mail-copy-admin.reader.js";
import type { MailCopyEntryState } from "../domain/mail-copy-entry.js";
import { MAIL_COPY_LOCALES, type MailCopyLocale } from "../domain/mail-copy-locale.js";
import {
  audienceOf,
  idOf,
  type MailCopyManifest,
  type MailCopyManifestEntry,
  type MailDescription,
} from "../domain/mail-copy-manifest.js";
import { defaultChangedSince } from "../domain/mail-copy-default-drift.js";
import { staleMailTranslations } from "../domain/mail-copy-staleness.js";
import type { MailSectionOrderState } from "../domain/mail-section-order.js";
import { mailSectionsAdminView } from "./mail-section-admin-view.js";

type Rows = ReadonlyMap<string, ReadonlyMap<MailCopyLocale, MailCopyEntryState>>;

/**
 * Assemble l'écran des textes des e-mails : chaque e-mail du registre, dans
 * l'ordre où l'écran les range, avec chacun de ses textes en trois langues et
 * ses sections ordonnées (E4) ; puis les orphelines — les lignes dont le texte
 * a quitté le code.
 */
export function mailCopyAdminView(
  manifest: MailCopyManifest,
  states: readonly MailCopyEntryState[],
  publication: MailCopyPublicationState,
  orders: readonly MailSectionOrderState[] = [],
): MailCopyAdminView {
  const rows = byText(states);
  const orderOf = new Map(orders.map((order) => [order.mail, order]));
  const orphans = [...rows.entries()]
    .filter(([, locales]) => {
      const any = [...locales.values()][0];
      return any !== undefined && !manifest.knows(any.mail, any.path);
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, locales]) => {
      const any = [...locales.values()][0];
      return any === undefined ? [] : [textView(any.mail, any.path, null, rows)];
    });
  const mails = manifest
    .mails()
    .map((mail) => mailView(mail, manifest, rows, orderOf.get(mail.mail) ?? null));
  return {
    version: publication.version,
    publishedAt: publication.publishedAt?.toISOString() ?? null,
    publishedBy: publication.publishedBy,
    pendingCount:
      states.filter((state) => state.draft.state !== "unchanged").length +
      orders.filter((order) => order.draft.state !== "unchanged").length,
    defaultChangedCount: countDefaultChanges(mails),
    mails,
    orphans,
  };
}

function mailView(
  mail: MailDescription,
  manifest: MailCopyManifest,
  rows: Rows,
  order: MailSectionOrderState | null,
): MailCopyMailView {
  const texts = manifest
    .textsOf(mail.mail)
    .map((entry) => textView(entry.mail, entry.path, entry, rows));
  const pendingCount = texts.reduce(
    (sum, text) =>
      sum +
      MAIL_COPY_LOCALES.filter((locale) => text.locales[locale].draftState !== "unchanged").length,
    0,
  );
  const layout = mailSectionsAdminView(mail.mail, manifest, order);
  return {
    mail: mail.mail,
    audience: audienceOf(mail.mail),
    family: mail.family,
    followsLocale: mail.followsLocale,
    pendingCount: pendingCount + layout.pendingCount,
    texts,
    frames: layout.frames,
    sections: layout.sections,
    sectionOrder: layout.sectionOrder,
  };
}

/** Les textes, toutes langues, dont le texte du code a changé depuis leur modification. */
function countDefaultChanges(mails: readonly MailCopyMailView[]): number {
  return mails
    .flatMap((mail) => mail.texts)
    .flatMap((text) => MAIL_COPY_LOCALES.map((locale) => text.locales[locale]))
    .filter((locale) => locale.defaultChangedSince !== null).length;
}

function byText(states: readonly MailCopyEntryState[]): Rows {
  const rows = new Map<string, Map<MailCopyLocale, MailCopyEntryState>>();
  for (const state of states) {
    const id = idOf(state.mail, state.path);
    const locales = rows.get(id) ?? new Map<MailCopyLocale, MailCopyEntryState>();
    locales.set(state.locale, state);
    rows.set(id, locales);
  }
  return rows;
}

function textView(
  mail: string,
  path: string,
  entry: MailCopyManifestEntry | null,
  rows: Rows,
): MailCopyTextView {
  const locales = rows.get(idOf(mail, path));
  const view = (locale: MailCopyLocale): MailCopyLocaleView =>
    localeView(entry?.defaults[locale] ?? null, locales?.get(locale) ?? null);
  return {
    mail,
    path,
    variables: entry?.allowed ?? [],
    requiredVariables: entry?.required ?? [],
    locales: { fr: view("fr"), en: view("en"), it: view("it") },
    staleTranslations: staleMailTranslations(
      Object.fromEntries(
        MAIL_COPY_LOCALES.map((locale) => [locale, locales?.get(locale)?.drafted?.at ?? null]),
      ),
    ),
  };
}

function localeView(fallback: string | null, state: MailCopyEntryState | null): MailCopyLocaleView {
  const draft = state?.draft ?? { state: "unchanged" as const };
  return {
    default: fallback,
    draftState: draft.state,
    draftText: draft.state === "set" ? draft.text : null,
    publishedText: state?.publishedText ?? null,
    revision: state?.revision ?? 0,
    draftAt: state?.drafted?.at.toISOString() ?? null,
    draftBy: state?.drafted?.staffId ?? null,
    defaultChangedSince: previousDefaultView(defaultChangedSince(state, fallback)),
  };
}

function previousDefaultView(previousDefault: string | null): MailCopyDefaultChangeView | null {
  return previousDefault === null ? null : { previousDefault };
}
