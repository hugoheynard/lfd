import { Logger } from "@nestjs/common";

import {
  RoadRoutingUnavailableError,
  UnknownCostPointError,
} from "../domain/errors/delivery-routing-errors.js";
import { type CostFn, DistanceMatrix } from "../domain/ports/distance-matrix.js";
import type { GeoPoint } from "../domain/value-objects/geo-point.js";
import type { FetchFn } from "./ban-geocoder.js";
import { type OsrmFetchOutcome, osrmGet } from "./osrm-fetch.js";

/**
 * Le délai d'un appel à `/table`, puis UN nouvel essai (L10b-C5). Large parce
 * que le premier « Proposer » du matin réveille une instance `lite` endormie
 * (`sleepAfter = "10m"`, `apps/lfd-osrm/src/worker.ts`) : 0,6 s mesurées en
 * local (L8-C6), le démarrage à froid sur Cloudflare n'est PAS encore mesuré
 * (L8-C10).
 */
export const OSRM_TIMEOUT_MS = 20_000;

/** `--max-table-size` d'`osrm-routed` (`apps/lfd-osrm/Dockerfile`) : jusque-là, une seule requête. */
export const OSRM_MAX_TABLE_POINTS = 200;

/** Au-delà, la table passe par blocs d'au plus 100 départs × 100 arrivées (100² ≤ 200²). */
export const OSRM_BLOCK_POINTS = 100;

/** Combien de blocs partent en même temps : une instance `lite` n'a qu'un cœur à partager. */
export const OSRM_PARALLEL_BLOCKS = 3;

/** Les bornes, réglables en test pour éprouver le découpage sur trois points réels. */
export interface OsrmTableOptions {
  readonly fetchFn?: FetchFn;
  readonly timeoutMs?: number;
  readonly maxTablePoints?: number;
  readonly blockPoints?: number;
  readonly parallelBlocks?: number;
}

/** Un bloc de la table : les index de ses départs et de ses arrivées dans la liste complète. */
interface Block {
  readonly sources: readonly number[];
  readonly destinations: readonly number[];
}

/** Ce qu'un bloc rend : `sources.length` lignes de `destinations.length` cases. */
interface BlockTable {
  readonly meters: readonly (readonly number[])[];
  readonly seconds: readonly (readonly number[])[];
}

/**
 * **Les coûts par la route** (lot 8, L10b-C5) : `GET /table` d'OSRM, durées
 * ET distances, entre tous les points.
 *
 * Jusqu'à {@link OSRM_MAX_TABLE_POINTS} points, une requête ; au-delà, des
 * blocs `sources=`/`destinations=` recollés, quelques-uns à la fois. Les
 * coûts sont **asymétriques** (sens uniques, montées) et pris tels quels :
 * l'ordonnanceur est déjà ATSP.
 *
 * Plus de repli : un délai dépassé ou un 503 (le réveil) a droit à UN nouvel
 * essai ; au-delà, ou sur tout autre échec — refus, réponse illisible, trajet
 * introuvable, un seul bloc manquant —, {@link RoadRoutingUnavailableError}.
 * Jamais une table à moitié routière.
 */
export class OsrmDistanceMatrix extends DistanceMatrix {
  private readonly logger = new Logger("Calcul routier");
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly maxTablePoints: number;
  private readonly blockPoints: number;
  private readonly parallelBlocks: number;

  constructor(
    private readonly baseUrl: string,
    options: OsrmTableOptions = {},
  ) {
    super();
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? OSRM_TIMEOUT_MS;
    this.maxTablePoints = options.maxTablePoints ?? OSRM_MAX_TABLE_POINTS;
    this.blockPoints = options.blockPoints ?? OSRM_BLOCK_POINTS;
    this.parallelBlocks = options.parallelBlocks ?? OSRM_PARALLEL_BLOCKS;
  }

  async build(points: ReadonlyMap<string, GeoPoint>): Promise<CostFn> {
    const entries = [...points.entries()];
    const coordinates = entries.map(([, point]) => point);
    const all = entries.map((_, index) => index);
    if (entries.length <= this.maxTablePoints) {
      const table = await this.block(coordinates, { sources: all, destinations: all }, false);
      return roadCost(
        entries.map(([id]) => id),
        table,
      );
    }
    const chunks = chunked(all, this.blockPoints);
    const blocks = chunks.flatMap((sources) =>
      chunks.map((destinations): Block => ({ sources, destinations })),
    );
    const tables = await inPool(blocks, this.parallelBlocks, (block) =>
      this.block(coordinates, block, true),
    );
    return roadCost(
      entries.map(([id]) => id),
      assembled(entries.length, blocks, tables),
    );
  }

  /** Un bloc de la table ; `partial` : la requête nomme ses `sources` et `destinations`. */
  private async block(
    coordinates: readonly GeoPoint[],
    block: Block,
    partial: boolean,
  ): Promise<BlockTable> {
    const url = partial ? this.partialUrl(coordinates, block) : this.fullUrl(coordinates);
    const outcome = await osrmGet(this.fetchFn, url, this.timeoutMs, (body) =>
      tableOf(body, block.sources.length, block.destinations.length),
    );
    return this.tableOrRefuse(outcome);
  }

  private tableOrRefuse(outcome: OsrmFetchOutcome<BlockTable>): BlockTable {
    if ("value" in outcome) {
      return outcome.value;
    }
    // Le journal dit pourquoi — sans coordonnée : un point GPS situe un client.
    this.logger.warn(`OSRM ne répond pas (${outcome.failure}) : proposition refusée.`);
    throw new RoadRoutingUnavailableError();
  }

  private fullUrl(coordinates: readonly GeoPoint[]): string {
    return `${this.tableBase(coordinates)}?annotations=duration,distance`;
  }

  /** Les départs d'abord, puis les arrivées ; un bloc diagonal ne les envoie qu'une fois. */
  private partialUrl(coordinates: readonly GeoPoint[], block: Block): string {
    const diagonal = block.sources === block.destinations;
    const sent = diagonal ? block.sources : [...block.sources, ...block.destinations];
    const picked = sent.flatMap((index) => coordinates[index] ?? []);
    const count = block.sources.length;
    const sources = block.sources.map((_, position) => position);
    const destinations = block.destinations.map((_, position) =>
      diagonal ? position : count + position,
    );
    return `${this.tableBase(picked)}?annotations=duration,distance&sources=${sources.join(";")}&destinations=${destinations.join(";")}`;
  }

  private tableBase(coordinates: readonly GeoPoint[]): string {
    // OSRM lit `longitude,latitude`, dans cet ordre.
    const path = coordinates.map((point) => `${String(point.lng)},${String(point.lat)}`);
    return `${this.baseUrl.replace(/\/+$/u, "")}/table/v1/driving/${path.join(";")}`;
  }
}

/**
 * Lit la réponse **défensivement** : elle vient du réseau. `code` autre que
 * `Ok`, une matrice qui n'a pas la bonne taille, ou une case `null` (OSRM ne
 * trouve aucun trajet entre deux points) : illisible, donc refus.
 */
function tableOf(body: unknown, rows: number, columns: number): BlockTable | null {
  if (typeof body !== "object" || body === null || !("code" in body) || body.code !== "Ok") {
    return null;
  }
  const meters = "distances" in body ? rectangleOf(body.distances, rows, columns) : null;
  const seconds = "durations" in body ? rectangleOf(body.durations, rows, columns) : null;
  return meters === null || seconds === null ? null : { meters, seconds };
}

function rectangleOf(
  value: unknown,
  rows: number,
  columns: number,
): readonly (readonly number[])[] | null {
  if (!Array.isArray(value) || value.length !== rows) {
    return null;
  }
  const result: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== columns) {
      return null;
    }
    const cells = row.filter(
      (cell): cell is number => typeof cell === "number" && Number.isFinite(cell) && cell >= 0,
    );
    if (cells.length !== columns) {
      return null;
    }
    result.push(cells);
  }
  return result;
}

/**
 * Découpe en morceaux ÉGAUX d'au plus `size` : 201 points font trois blocs de
 * 67, jamais 100 + 100 + 1 — OSRM refuse une table à une seule coordonnée
 * (`InvalidOptions`, constaté le 2026-09-29 contre l'image locale).
 */
function chunked(indexes: readonly number[], size: number): readonly (readonly number[])[] {
  const count = Math.ceil(indexes.length / size);
  const chunks: (readonly number[])[] = [];
  for (let chunk = 0; chunk < count; chunk += 1) {
    const start = Math.floor((chunk * indexes.length) / count);
    const end = Math.floor(((chunk + 1) * indexes.length) / count);
    chunks.push(indexes.slice(start, end));
  }
  return chunks;
}

/** Recolle les blocs en une table carrée. */
function assembled(
  size: number,
  blocks: readonly Block[],
  tables: readonly BlockTable[],
): BlockTable {
  const meters = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const seconds = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  blocks.forEach((block, index) => {
    const table = tables[index];
    block.sources.forEach((from, row) => {
      block.destinations.forEach((to, column) => {
        const meterRow = meters[from];
        const secondRow = seconds[from];
        if (meterRow !== undefined && secondRow !== undefined) {
          meterRow[to] = table?.meters[row]?.[column] ?? 0;
          secondRow[to] = table?.seconds[row]?.[column] ?? 0;
        }
      });
    });
  });
  return { meters, seconds };
}

/** Exécute `work` sur chaque élément, `size` à la fois ; l'ordre des résultats est celui des éléments. */
async function inPool<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Map<number, R>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) {
        results.set(index, await work(item));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return items.flatMap((_, index) => {
    const result = results.get(index);
    return result === undefined ? [] : [result];
  });
}

function roadCost(ids: readonly string[], table: BlockTable): CostFn {
  const index = new Map(ids.map((id, position) => [id, position]));
  const lookup =
    (matrix: BlockTable["meters"]) =>
    (fromId: string, toId: string): number => {
      const from = index.get(fromId);
      const to = index.get(toId);
      const value = from === undefined || to === undefined ? undefined : matrix[from]?.[to];
      if (value === undefined) {
        throw new UnknownCostPointError(from === undefined ? fromId : toId);
      }
      return value;
    };
  return { meters: lookup(table.meters), seconds: lookup(table.seconds) };
}
