import { Prisma } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { ObjectSettingsInput, ObjectSettingsState } from "../domain/object-settings.js";
import type { StorefrontContentState } from "../domain/storefront-content.js";
import type { StorefrontObjectInput } from "../domain/storefront-object.js";
import type { StorefrontTemplateInput } from "../domain/storefront-template.js";
import type { StorefrontTextState } from "../domain/storefront-text.js";

/**
 * Les mappers ligne ↔ domaine de la vitrine — partagés par le dépôt et les
 * deux lecteurs, pour qu'une colonne ne se traduise qu'à un endroit.
 *
 * Aucun type `Prisma.*` ne sort de ce dossier : les lignes deviennent des
 * ENTRÉES du domaine, que ses value objects revalident.
 */

/** Les colonnes de réglages, communes aux objets et aux gabarits. */
interface SettingsColumns {
  readonly shape: string;
  readonly applyOnMobile: boolean;
  readonly mediaFit: string;
  readonly mediaSide: string;
  readonly multiple: boolean;
  readonly nav: string;
  readonly autoplay: boolean;
  readonly intervalS: number;
  readonly firstS: number;
  readonly sampleCount: number;
  readonly tone: string;
}

interface ContentColumns {
  readonly kind: string;
  readonly productSku: string | null;
  readonly badge: Prisma.JsonValue;
  readonly title: Prisma.JsonValue;
  readonly lede: Prisma.JsonValue;
  readonly imageUrl: string | null;
  readonly imageAlt: Prisma.JsonValue;
  readonly linkShelfKey: string | null;
}

export interface ObjectRow extends SettingsColumns {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  readonly shelves: readonly { readonly shelfKey: string }[];
  readonly contents: readonly ContentColumns[];
}

export interface TemplateRow extends SettingsColumns {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

/**
 * Une ligne que le domaine n'aurait pas pu écrire (**500**) : un `jsonb` qui
 * n'est pas un texte localisé, un `kind` inconnu. Les CHECK de la migration
 * l'interdisent ; si elle arrive quand même, la base a été écrite à la main.
 */
class CorruptStorefrontRowError extends TechnicalError {
  constructor(detail: string) {
    super(
      "storefront.corrupt_row",
      `Une ligne de la vitrine est illisible (${detail}) : elle a été écrite hors de l'application.`,
    );
  }
}

export function settingsOfRow(row: SettingsColumns): ObjectSettingsInput {
  return {
    shape: row.shape,
    applyOnMobile: row.applyOnMobile,
    mediaFit: row.mediaFit,
    mediaSide: row.mediaSide,
    multiple: row.multiple,
    carousel: {
      nav: row.nav,
      autoplay: row.autoplay,
      intervalSeconds: row.intervalS,
      firstSeconds: row.firstS,
      sampleCount: row.sampleCount,
    },
    tone: row.tone,
  };
}

export function settingsColumns(settings: ObjectSettingsState): SettingsColumns {
  return {
    shape: settings.shape,
    applyOnMobile: settings.applyOnMobile,
    mediaFit: settings.mediaFit,
    mediaSide: settings.mediaSide,
    multiple: settings.multiple,
    nav: settings.carousel.nav,
    autoplay: settings.carousel.autoplay,
    intervalS: settings.carousel.intervalSeconds,
    firstS: settings.carousel.firstSeconds,
    sampleCount: settings.carousel.sampleCount,
    tone: settings.tone,
  };
}

export function objectInputOf(row: ObjectRow): StorefrontObjectInput {
  return {
    id: row.id,
    settings: settingsOfRow(row),
    column: row.col,
    row: row.row,
    shelves: row.shelves.map((shelf) => shelf.shelfKey),
    contents: row.contents.map(contentOfRow),
  };
}

export function templateInputOf(row: TemplateRow): StorefrontTemplateInput {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    settings: settingsOfRow(row),
  };
}

function contentOfRow(row: ContentColumns): StorefrontContentState {
  if (row.kind === "product" && row.productSku !== null) {
    return { kind: "product", sku: row.productSku };
  }
  const title = textOf(row.title);
  if (row.kind !== "info" || title === null) {
    throw new CorruptStorefrontRowError(`contenu de nature « ${row.kind} »`);
  }
  return {
    kind: "info",
    badge: textOf(row.badge),
    title,
    lede: textOf(row.lede),
    image: row.imageUrl === null ? null : { url: row.imageUrl, alt: textOf(row.imageAlt) },
    linkShelfKey: row.linkShelfKey,
  };
}

/** Une colonne `jsonb` nullable, à l'écriture : `DbNull` est l'ABSENCE, pas un `null` JSON. */
type NullableJson = Prisma.InputJsonValue | typeof Prisma.DbNull;

/** Les colonnes d'un contenu, pour l'écriture. `DbNull` : l'ABSENCE, pas un `null` JSON. */
export function contentColumns(content: StorefrontContentState): {
  readonly kind: string;
  readonly productSku: string | null;
  readonly badge: NullableJson;
  readonly title: NullableJson;
  readonly lede: NullableJson;
  readonly imageUrl: string | null;
  readonly imageAlt: NullableJson;
  readonly linkShelfKey: string | null;
} {
  if (content.kind === "product") {
    return {
      kind: "product",
      productSku: content.sku,
      badge: Prisma.DbNull,
      title: Prisma.DbNull,
      lede: Prisma.DbNull,
      imageUrl: null,
      imageAlt: Prisma.DbNull,
      linkShelfKey: null,
    };
  }
  return {
    kind: "info",
    productSku: null,
    badge: jsonOf(content.badge),
    title: jsonOf(content.title),
    lede: jsonOf(content.lede),
    imageUrl: content.image?.url ?? null,
    imageAlt: jsonOf(content.image?.alt ?? null),
    linkShelfKey: content.linkShelfKey,
  };
}

function jsonOf(text: StorefrontTextState | null): NullableJson {
  if (text === null) {
    return Prisma.DbNull;
  }
  const json: Record<string, string> = { fr: text.fr };
  if (text.en !== undefined) {
    json["en"] = text.en;
  }
  if (text.it !== undefined) {
    json["it"] = text.it;
  }
  return json;
}

/** Un `jsonb` de texte localisé, relu. `null` : la colonne est vide. */
function textOf(value: Prisma.JsonValue): StorefrontTextState | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CorruptStorefrontRowError("texte localisé qui n'est pas un objet");
  }
  const fr = value["fr"];
  if (typeof fr !== "string") {
    throw new CorruptStorefrontRowError("texte localisé sans français");
  }
  const en = value["en"];
  const it = value["it"];
  return {
    fr,
    ...(typeof en === "string" ? { en } : {}),
    ...(typeof it === "string" ? { it } : {}),
  };
}
