import {
  isMailSpace,
  MAIL_LOCALES,
  type Localized,
  type MailCharterSettings,
} from "@lfd/mail-blocks";

import { Prisma } from "../../../platform/database/client/client.js";
import { parseMailCharterSettings } from "../application/mail-charter-shape.js";
import { StoredMailCharterUnreadableError } from "../domain/mail-charter-errors.js";
import type {
  MailCharterStamp,
  MailSpaceCharterState,
  PublishedMailCharter,
} from "../domain/mail-space-charter.js";

/** La ligne de `mail.mail_charter` telle que Prisma la rend — confinée ici. */
export interface MailCharterRow {
  readonly space: string;
  readonly revision: number;
  readonly draft: Prisma.JsonValue;
  readonly draftAt: Date | null;
  readonly draftBy: string | null;
  readonly published: Prisma.JsonValue;
  readonly publishedVersion: number | null;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
  readonly lastVersion: number;
}

/** La ligne de `mail.mail_charter_version`. */
export interface MailCharterVersionRow {
  readonly space: string;
  readonly version: number;
  readonly settings: Prisma.JsonValue;
  readonly publishedAt: Date;
  readonly publishedBy: string;
}

function stampOf(at: Date | null, staffId: string | null): MailCharterStamp | null {
  return at === null || staffId === null ? null : { at, staffId };
}

function settingsOf(space: string, raw: Prisma.JsonValue): MailCharterSettings | null {
  if (raw === null) {
    return null;
  }
  const settings = parseMailCharterSettings(raw);
  if (settings === null) {
    throw new StoredMailCharterUnreadableError(space);
  }
  return settings;
}

/**
 * Relit une ligne. Une charte rangée qui n'a plus la forme d'une charte est
 * refusée tout haut : la page ne la rouvre pas en la devinant.
 */
export function toCharterState(row: MailCharterRow): MailSpaceCharterState {
  if (!isMailSpace(row.space)) {
    throw new StoredMailCharterUnreadableError(row.space);
  }
  const draft = settingsOf(row.space, row.draft);
  const draftStamp = stampOf(row.draftAt, row.draftBy);
  const published = settingsOf(row.space, row.published);
  const publishedStamp = stampOf(row.publishedAt, row.publishedBy);
  return {
    space: row.space,
    revision: row.revision,
    draft: draft === null || draftStamp === null ? null : { settings: draft, stamp: draftStamp },
    published:
      published === null || publishedStamp === null || row.publishedVersion === null
        ? null
        : { settings: published, version: row.publishedVersion, stamp: publishedStamp },
    lastVersion: row.lastVersion,
  };
}

/** Relit une version de l'historique. */
export function toPublishedCharter(row: MailCharterVersionRow): PublishedMailCharter {
  const settings = settingsOf(row.space, row.settings);
  if (settings === null) {
    throw new StoredMailCharterUnreadableError(row.space);
  }
  return {
    settings,
    version: row.version,
    stamp: { at: row.publishedAt, staffId: row.publishedBy },
  };
}

function localizedJson(text: Localized<string>): Prisma.InputJsonObject {
  return Object.fromEntries(
    MAIL_LOCALES.flatMap((locale) => {
      const value = text[locale];
      return value === undefined ? [] : [[locale, value]];
    }),
  );
}

/** Les réglages en `jsonb` : une langue absente n'est pas écrite. */
export function charterSettingsJson(settings: MailCharterSettings): Prisma.InputJsonObject {
  return {
    logo:
      settings.logo === null
        ? null
        : { src: settings.logo.src, alt: localizedJson(settings.logo.alt) },
    colors: { ...settings.colors },
    darkColors: { ...settings.darkColors },
    headingFont: settings.headingFont === null ? null : { ...settings.headingFont },
    footer: localizedJson(settings.footer),
  };
}

function nullableJson(
  settings: MailCharterSettings | null,
): Prisma.InputJsonObject | typeof Prisma.DbNull {
  return settings === null ? Prisma.DbNull : charterSettingsJson(settings);
}

/** Les colonnes de `mail.mail_charter` pour un état. */
export function toCharterColumns(state: MailSpaceCharterState) {
  return {
    revision: state.revision,
    draft: nullableJson(state.draft?.settings ?? null),
    draftAt: state.draft?.stamp.at ?? null,
    draftBy: state.draft?.stamp.staffId ?? null,
    published: nullableJson(state.published?.settings ?? null),
    publishedVersion: state.published?.version ?? null,
    publishedAt: state.published?.stamp.at ?? null,
    publishedBy: state.published?.stamp.staffId ?? null,
    lastVersion: state.lastVersion,
  };
}
