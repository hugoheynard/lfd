import type { Prisma } from "../../platform/database/client/client.js";

import type { LibraryPosition, LibrarySort } from "../domain/value-objects/library-order.js";
import type { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import { ASSET_COLUMNS, type AssetRow } from "./library-rows.js";
import { dayValue } from "./series-day.js";

export interface KeysetRequest {
  readonly where: Prisma.MediaAssetWhereInput;
  readonly limit: number;
  /** L'ancien décalage — servi pour l'ordre `deposited` seul, sans curseur. */
  readonly offset: number;
  readonly after?: LibraryPosition | undefined;
}

/** Une page lue, et s'il reste quelque chose derrière. */
export interface KeysetRows {
  readonly rows: readonly AssetRow[];
  readonly more: boolean;
}

type KeysetReader = (prisma: MediaPrismaService, request: KeysetRequest) => Promise<KeysetRows>;

/**
 * **Les ordres qui se lisent en base**, par clé (« keyset ») et pas par rang.
 *
 * Chacun lit `limit + 1` lignes : la dernière ne sert qu'à savoir s'il en reste.
 * Un ordre ABSENT de cette table (`uses`) ne peut pas s'écrire en SQL — ses
 * clés viennent des porteurs — et l'adaptateur le classe en mémoire.
 *
 * 🔴 Une table, pas un `switch` : la prise de vue (`shot`, L3) est une entrée
 * de plus.
 */
export const KEYSET_READERS: Readonly<Partial<Record<LibrarySort, KeysetReader>>> = {
  deposited: byDeposit,
  name: byName,
  shot: byShot,
};

async function byDeposit(prisma: MediaPrismaService, request: KeysetRequest): Promise<KeysetRows> {
  const { after, limit } = request;
  const rows = await prisma.mediaAsset.findMany({
    where: after === undefined ? request.where : { AND: [request.where, afterDeposit(after)] },
    select: ASSET_COLUMNS,
    // L'URL départage deux dépôts du même instant : sans elle, une image
    // pourrait passer d'une page à l'autre entre deux lectures.
    orderBy: [{ createdAt: "desc" }, { url: "asc" }],
    take: limit + 1,
    ...(after === undefined ? { skip: request.offset } : {}),
  });
  return split(rows, limit);
}

/** Plus ancien que la position, ou du même instant et d'URL plus grande. */
function afterDeposit(position: LibraryPosition): Prisma.MediaAssetWhereInput {
  // `createdAt` est en millisecondes (`timestamp(3)`), comme l'ISO du curseur :
  // l'égalité est exacte.
  const at = new Date(String(position.key));
  return { OR: [{ createdAt: { lt: at } }, { createdAt: at, url: { gt: position.url } }] };
}

/**
 * Par étiquette, les images sans étiquette EN DERNIER.
 *
 * Deux segments plutôt qu'une expression de tri : `ORDER BY name` mettrait les
 * `''` en tête, et le client Prisma n'exprime pas « vide en dernier » sur une
 * chaîne. Les étiquetées d'abord (nom puis URL), puis les autres (URL) ; une
 * position de clé `''` est dans le second segment.
 */
async function byName(prisma: MediaPrismaService, request: KeysetRequest): Promise<KeysetRows> {
  const { after, limit, where } = request;
  const inUnnamed = after !== undefined && after.key === "";
  const named = inUnnamed
    ? []
    : await prisma.mediaAsset.findMany({
        where: { AND: [where, { NOT: { name: "" } }, ...(after ? [afterName(after)] : [])] },
        select: ASSET_COLUMNS,
        orderBy: [{ name: "asc" }, { url: "asc" }],
        take: limit + 1,
      });
  if (named.length > limit) {
    return split(named, limit);
  }
  const unnamed = await prisma.mediaAsset.findMany({
    where: {
      AND: [where, { name: "" }, ...(inUnnamed ? [{ url: { gt: after.url } }] : [])],
    },
    select: ASSET_COLUMNS,
    orderBy: [{ url: "asc" }],
    take: limit - named.length + 1,
  });
  return split([...named, ...unnamed], limit);
}

function afterName(position: LibraryPosition): Prisma.MediaAssetWhereInput {
  const name = String(position.key);
  return { OR: [{ name: { gt: name } }, { name, url: { gt: position.url } }] };
}

/** Une image rangée dans une série DATÉE. */
const DATED: Prisma.MediaAssetWhereInput = { series: { shotOn: { not: null } } };
/** Sans série, ou dans une série sans date. */
const UNDATED: Prisma.MediaAssetWhereInput = {
  OR: [{ seriesId: null }, { series: { shotOn: null } }],
};

/**
 * Par prise de vue de la série, la plus récente d'abord, les images sans date
 * EN DERNIER (L3, 2026-10-10).
 *
 * Deux segments, comme {@link byName} : les datées (jour décroissant, puis URL),
 * puis les autres (URL). Une position de clé `''` est dans le second.
 */
async function byShot(prisma: MediaPrismaService, request: KeysetRequest): Promise<KeysetRows> {
  const { after, limit, where } = request;
  const inUndated = after !== undefined && after.key === "";
  const dated = inUndated
    ? []
    : await prisma.mediaAsset.findMany({
        where: { AND: [where, DATED, ...(after ? [afterShot(after)] : [])] },
        select: ASSET_COLUMNS,
        orderBy: [{ series: { shotOn: "desc" } }, { url: "asc" }],
        take: limit + 1,
      });
  if (dated.length > limit) {
    return split(dated, limit);
  }
  const undated = await prisma.mediaAsset.findMany({
    where: { AND: [where, UNDATED, ...(inUndated ? [{ url: { gt: after.url } }] : [])] },
    select: ASSET_COLUMNS,
    orderBy: [{ url: "asc" }],
    take: limit - dated.length + 1,
  });
  return split([...dated, ...undated], limit);
}

function afterShot(position: LibraryPosition): Prisma.MediaAssetWhereInput {
  const day = dayValue(String(position.key));
  return {
    OR: [
      { series: { shotOn: { lt: day } } },
      { series: { shotOn: day }, url: { gt: position.url } },
    ],
  };
}

function split(rows: readonly AssetRow[], limit: number): KeysetRows {
  return { rows: rows.slice(0, limit), more: rows.length > limit };
}
