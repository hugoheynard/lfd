import {
  MAIL_LOCALES,
  type FreeBlock,
  type Localized,
  type MailBlock,
  type MailDocument,
} from "@lfd/mail-blocks";

import { Prisma } from "../../../platform/database/client/client.js";
import { parseMailDocument } from "../application/mail-document-shape.js";
import { StoredMailDocumentUnreadableError } from "../domain/mail-document-errors.js";
import type {
  MailDocumentStamp,
  MailTemplateDocumentState,
} from "../domain/mail-template-document.js";

/** La ligne de `mail.mail_document` telle que Prisma la rend — confinée ici. */
export interface MailDocumentRow {
  readonly template: string;
  readonly revision: number;
  readonly draft: Prisma.JsonValue;
  readonly draftAt: Date | null;
  readonly draftBy: string | null;
  readonly published: Prisma.JsonValue;
  readonly publishedVersion: number | null;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
  readonly lastVersion: number;
  readonly retractedAt: Date | null;
  readonly retractedBy: string | null;
}

function stampOf(at: Date | null, staffId: string | null): MailDocumentStamp | null {
  return at === null || staffId === null ? null : { at, staffId };
}

function documentOf(template: string, raw: Prisma.JsonValue): MailDocument | null {
  if (raw === null) {
    return null;
  }
  const document = parseMailDocument(raw);
  if (document === null) {
    throw new StoredMailDocumentUnreadableError(template);
  }
  return document;
}

/**
 * Relit une ligne. Un document rangé qui n'a plus la forme d'un document est
 * refusé tout haut : l'éditeur ne le rouvre pas en le devinant.
 */
export function toDocumentState(row: MailDocumentRow): MailTemplateDocumentState {
  const draft = documentOf(row.template, row.draft);
  const draftStamp = stampOf(row.draftAt, row.draftBy);
  const published = documentOf(row.template, row.published);
  const publishedStamp = stampOf(row.publishedAt, row.publishedBy);
  return {
    template: row.template,
    revision: row.revision,
    draft: draft === null || draftStamp === null ? null : { document: draft, stamp: draftStamp },
    published:
      published === null || publishedStamp === null || row.publishedVersion === null
        ? null
        : { document: published, version: row.publishedVersion, stamp: publishedStamp },
    lastVersion: row.lastVersion,
    retracted: stampOf(row.retractedAt, row.retractedBy),
  };
}

function localizedJson(text: Localized<string>): Prisma.InputJsonValue {
  return Object.fromEntries(
    MAIL_LOCALES.flatMap((locale) => {
      const value = text[locale];
      return value === undefined ? [] : [[locale, value]];
    }),
  );
}

function freeBlockJson(block: FreeBlock): Prisma.InputJsonValue {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return { id: block.id, kind: block.kind, text: localizedJson(block.text) };
    case "callout":
      return { id: block.id, kind: block.kind, tone: block.tone, text: localizedJson(block.text) };
    case "button":
      return {
        id: block.id,
        kind: block.kind,
        label: localizedJson(block.label),
        href: block.href,
      };
    case "divider":
      return { id: block.id, kind: block.kind };
  }
}

function blockJson(block: MailBlock): Prisma.InputJsonValue {
  if (block.kind === "model") {
    return { id: block.id, kind: block.kind, section: block.section };
  }
  if (block.kind === "columns") {
    return {
      id: block.id,
      kind: block.kind,
      widths: [...block.widths],
      cells: block.cells.map((cell) => cell.map(freeBlockJson)),
    };
  }
  return freeBlockJson(block);
}

/**
 * Le document en `jsonb`, **écrit champ à champ** : une propriété ajoutée au
 * contrat n'entre pas dans une colonne rangée sans qu'on l'ait décidé.
 */
export function mailDocumentJson(document: MailDocument): Prisma.InputJsonValue {
  return { template: document.template, blocks: document.blocks.map(blockJson) };
}

/** Les colonnes que l'adaptateur écrit, la clé exceptée. */
export function toDocumentColumns(state: MailTemplateDocumentState) {
  return {
    revision: state.revision,
    draft: state.draft === null ? Prisma.DbNull : mailDocumentJson(state.draft.document),
    draftAt: state.draft?.stamp.at ?? null,
    draftBy: state.draft?.stamp.staffId ?? null,
    published:
      state.published === null ? Prisma.DbNull : mailDocumentJson(state.published.document),
    publishedVersion: state.published?.version ?? null,
    publishedAt: state.published?.stamp.at ?? null,
    publishedBy: state.published?.stamp.staffId ?? null,
    lastVersion: state.lastVersion,
    retractedAt: state.retracted?.at ?? null,
    retractedBy: state.retracted?.staffId ?? null,
  };
}
