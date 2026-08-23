import { Prisma } from "../../../../platform/database/client/client.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { ShopifyProductPayload, ShopifyVariantPayload } from "./projection.js";

/**
 * Conversion du **payload rejouable** ↔ colonne `jsonb`.
 *
 * Un snapshot fige le `ShopifyProductPayload` tel quel : il faut pouvoir le ré-émettre
 * *à l'identique* au rollback. Postgres rend du JSON non typé — on le **vérifie** à la
 * lecture (une donnée corrompue lève une erreur technique franche) plutôt que de forcer
 * un cast qui mentirait au compilateur (même discipline que `json-readers.ts`).
 */
export class CorruptedSnapshotError extends TechnicalError {
  constructor() {
    super(
      "shopify.snapshot.corrupted",
      "Snapshot de poussée illisible en base : forme inattendue.",
    );
  }
}

/** `ShopifyProductPayload` → objet JSON écrivable par Prisma (littéral, pas d'interface). */
export function payloadColumn(payload: ShopifyProductPayload): Prisma.InputJsonValue {
  return {
    title: payload.title,
    handle: payload.handle,
    status: payload.status,
    variants: payload.variants.map((variant) => ({
      sku: variant.sku,
      title: variant.title,
      options: { ...variant.options },
      price: variant.price,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    throw new CorruptedSnapshotError();
  }
  return value;
}

function readStatus(value: unknown): "DRAFT" | "ACTIVE" {
  if (value !== "DRAFT" && value !== "ACTIVE") {
    throw new CorruptedSnapshotError();
  }
  return value;
}

function readOptions(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw new CorruptedSnapshotError();
  }
  const options: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    options[key] = readString(entry);
  }
  return options;
}

function readVariant(value: unknown): ShopifyVariantPayload {
  if (!isRecord(value)) {
    throw new CorruptedSnapshotError();
  }
  return {
    sku: readString(value["sku"]),
    title: readString(value["title"]),
    options: readOptions(value["options"]),
    price: value["price"] === null ? null : readString(value["price"]),
  };
}

/**
 * Champ absent d'un snapshot ANTÉRIEUR aux textes : il n'est pas corrompu, il a été
 * écrit avant que la description existe. On lit donc « rien de déclaré » plutôt que de
 * refuser — un historique ne se relit pas avec les exigences du présent.
 *
 * Conséquence assumée : rétablir une telle version efface la description en boutique.
 * C'est ce que « rétablir cette version » veut dire — elle n'en portait pas.
 */
function readOptionalString(value: unknown): string {
  return value === undefined || value === null ? "" : readString(value);
}

function readSeo(value: unknown): { title: string; description: string } {
  if (!isRecord(value)) {
    return { title: "", description: "" };
  }
  return {
    title: readOptionalString(value["title"]),
    description: readOptionalString(value["description"]),
  };
}

/** Colonne `jsonb` → `ShopifyProductPayload` vérifié — la matière du rollback. */
export function readPayloadColumn(value: unknown): ShopifyProductPayload {
  if (!isRecord(value) || !Array.isArray(value["variants"])) {
    throw new CorruptedSnapshotError();
  }
  return {
    title: readString(value["title"]),
    handle: readString(value["handle"]),
    status: readStatus(value["status"]),
    descriptionHtml: readOptionalString(value["descriptionHtml"]),
    vendor:
      value["vendor"] === undefined || value["vendor"] === null
        ? null
        : readString(value["vendor"]),
    seo: readSeo(value["seo"]),
    variants: value["variants"].map(readVariant),
  };
}
