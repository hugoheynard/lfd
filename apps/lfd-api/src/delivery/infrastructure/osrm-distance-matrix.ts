import { Logger } from "@nestjs/common";

import { UnknownCostPointError } from "../domain/errors/delivery-routing-errors.js";
import { DistanceMatrix, type EstimatedCost } from "../domain/ports/distance-matrix.js";
import type { GeoPoint } from "../domain/value-objects/geo-point.js";
import type { RoutingSettings } from "../domain/value-objects/routing-settings.js";
import type { FetchFn } from "./ban-geocoder.js";

/**
 * Au-delà, OSRM est tenu pour muet et la proposition retombe sur le vol
 * d'oiseau (L8-C3).
 *
 * Plus large que les 5 s de la BAN, et c'est voulu : le premier « Proposer »
 * du matin réveille une instance `lite` endormie (`sleepAfter = "10m"`,
 * `apps/lfd-osrm/src/worker.ts`). 0,6 s mesurées en local (L8-C6) ; le
 * démarrage à froid sur Cloudflare n'est PAS encore mesuré (L8-C10). Si le
 * premier appel du matin retombe au vol d'oiseau, c'est ce chiffre qu'on
 * élargit — pas le repli qu'on retire.
 */
export const OSRM_TIMEOUT_MS = 10_000;

/** `--max-table-size` d'`osrm-routed` (`apps/lfd-osrm/Dockerfile`) : les deux vont ensemble. */
export const OSRM_MAX_TABLE_POINTS = 200;

/** Une matrice carrée lue d'OSRM : ligne = départ, colonne = arrivée. */
interface RoadTable {
  readonly meters: readonly (readonly number[])[];
  readonly seconds: readonly (readonly number[])[];
}

/**
 * **Les coûts par la route** (lot 8) : un seul `GET /table` d'OSRM par
 * proposition, durées ET distances, entre tous les points.
 *
 * Les coûts sont **asymétriques** (sens uniques, montées) et pris tels quels :
 * l'ordonnanceur est déjà ATSP.
 *
 * Sur tout échec — délai, refus du Worker `lfd-osrm` (503), réponse
 * illisible, trajet impossible — la proposition ne tombe pas : elle se
 * calcule par le `fallback` (vol d'oiseau), et `estimate` le dit. Le trop
 * grand nombre de points aussi, sans appeler : un refus aurait fait tomber
 * « Proposer » dès qu'OSRM est branché, là où le vol d'oiseau le tenait
 * (L8-C3 ; `vitruve`, 2026-09-29).
 */
export class OsrmDistanceMatrix extends DistanceMatrix {
  private readonly logger = new Logger("Calcul routier");

  constructor(
    private readonly baseUrl: string,
    private readonly fallback: DistanceMatrix,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly timeoutMs: number = OSRM_TIMEOUT_MS,
  ) {
    super();
  }

  async build(
    points: ReadonlyMap<string, GeoPoint>,
    settings: RoutingSettings,
  ): Promise<EstimatedCost> {
    const ids = [...points.keys()];
    const table =
      points.size > OSRM_MAX_TABLE_POINTS
        ? `${String(points.size)} points, ${String(OSRM_MAX_TABLE_POINTS)} au plus`
        : await this.table(ids.map((id) => points.get(id)));
    if (typeof table === "string") {
      // Le repli n'est pas muet : l'écran dit « vol d'oiseau », et le journal
      // dit pourquoi — sans coordonnée, un point GPS situe un client.
      this.logger.warn(`OSRM ne répond pas (${table}) : proposition à vol d'oiseau.`);
      return this.fallback.build(points, settings);
    }
    return roadCost(ids, table);
  }

  /** La table, ou la raison de l'échec. */
  private async table(points: readonly (GeoPoint | undefined)[]): Promise<RoadTable | string> {
    // OSRM lit `longitude,latitude`, dans cet ordre.
    const coordinates = points.map((point) => `${String(point?.lng)},${String(point?.lat)}`);
    const url = `${this.baseUrl.replace(/\/+$/u, "")}/table/v1/driving/${coordinates.join(";")}?annotations=duration,distance`;
    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        return `statut ${String(response.status)}`;
      }
      return tableOf(await response.json(), points.length) ?? "réponse illisible";
    } catch (error: unknown) {
      return error instanceof Error ? error.name : "coupure inattendue";
    }
  }
}

/**
 * Lit la réponse **défensivement** : elle vient du réseau. `code` autre que
 * `Ok`, une matrice qui n'a pas la bonne taille, ou une case `null` (OSRM ne
 * trouve aucun trajet entre deux points) : illisible, donc repli.
 */
function tableOf(body: unknown, size: number): RoadTable | null {
  if (typeof body !== "object" || body === null || !("code" in body) || body.code !== "Ok") {
    return null;
  }
  const meters = "distances" in body ? squareOf(body.distances, size) : null;
  const seconds = "durations" in body ? squareOf(body.durations, size) : null;
  return meters === null || seconds === null ? null : { meters, seconds };
}

function squareOf(value: unknown, size: number): readonly (readonly number[])[] | null {
  if (!Array.isArray(value) || value.length !== size) {
    return null;
  }
  const rows: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== size) {
      return null;
    }
    const cells = row.filter(
      (cell): cell is number => typeof cell === "number" && Number.isFinite(cell) && cell >= 0,
    );
    if (cells.length !== size) {
      return null;
    }
    rows.push(cells);
  }
  return rows;
}

function roadCost(ids: readonly string[], table: RoadTable): EstimatedCost {
  const index = new Map(ids.map((id, position) => [id, position]));
  const lookup =
    (matrix: RoadTable["meters"]) =>
    (fromId: string, toId: string): number => {
      const from = index.get(fromId);
      const to = index.get(toId);
      const value = from === undefined || to === undefined ? undefined : matrix[from]?.[to];
      if (value === undefined) {
        throw new UnknownCostPointError(from === undefined ? fromId : toId);
      }
      return value;
    };
  return { meters: lookup(table.meters), seconds: lookup(table.seconds), estimate: "road" };
}
