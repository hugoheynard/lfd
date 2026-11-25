import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import type { ProductStation } from "../../domain/entities/product-placements.js";
import {
  type PlacementChange,
  type Workstation,
  WorkstationMap,
} from "../../domain/entities/workstation-map.js";
import {
  WorkstationMapRepository,
  type WorkstationMapStamp,
} from "../../domain/ports/workstation-map.repository.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";

/** Ce que le double a reçu à chaque `save` : la différence, et l'auteur. */
export interface SavedChanges {
  readonly workstations: readonly Workstation[];
  readonly placements: readonly PlacementChange[];
  readonly stamp: WorkstationMapStamp;
}

/**
 * La carte des postes EN MÉMOIRE : `load` rend une carte neuve sur l'état
 * gardé, `save` y applique la différence — comme l'adaptateur Prisma, sans
 * la base ni le verrou.
 *
 * `placements` donne à chaque produit un seul poste, qui le finit, ou la
 * liste de ses postes.
 */
export class InMemoryWorkstationMaps extends WorkstationMapRepository {
  readonly saved: SavedChanges[] = [];
  private readonly stations = new Map<string, Workstation>();
  private readonly placements = new Map<string, Map<string, ProductStation>>();

  constructor(
    stations: readonly Workstation[] = [],
    placements: ReadonlyMap<string, string | readonly ProductStation[]> = new Map(),
    positions: ReadonlyMap<string, number> = new Map(),
  ) {
    super();
    stations.forEach((station) => this.stations.set(station.id, station));
    placements.forEach((placed, product) => {
      const list =
        typeof placed === "string"
          ? [{ workstationId: placed, finishes: true, position: positions.get(product) ?? null }]
          : placed;
      this.placements.set(product, new Map(list.map((one) => [one.workstationId, one])));
    });
  }

  load(): Promise<WorkstationMap> {
    return Promise.resolve(
      WorkstationMap.rehydrate({
        workstations: [...this.stations.values()],
        placements: new Map(
          [...this.placements].map(([product, byStation]) => [product, [...byStation.values()]]),
        ),
      }),
    );
  }

  save(map: WorkstationMap, stamp: WorkstationMapStamp): Promise<void> {
    const changes = map.changes();
    this.saved.push({ ...changes, stamp });
    changes.workstations.forEach((station) => this.stations.set(station.id, station));
    for (const { productSku, workstationId, station } of changes.placements) {
      const byStation = this.placements.get(productSku) ?? new Map<string, ProductStation>();
      if (station === null) {
        byStation.delete(workstationId);
      } else {
        byStation.set(workstationId, station);
      }
      if (byStation.size === 0) {
        this.placements.delete(productSku);
      } else {
        this.placements.set(productSku, byStation);
      }
    }
    return Promise.resolve();
  }

  station(id: string): Workstation | undefined {
    return this.stations.get(id);
  }

  /** Le poste qui finit le produit. */
  workstationOf(product: string): string | null {
    const stations = [...(this.placements.get(product)?.values() ?? [])];
    return stations.find((one) => one.finishes)?.workstationId ?? null;
  }

  /** Les postes du produit, dans l'ordre d'arrivée. */
  stationsOf(product: string): readonly ProductStation[] {
    return [...(this.placements.get(product)?.values() ?? [])];
  }

  /** Sa place dans la pile d'un poste (par défaut celui qui le finit). */
  positionOf(product: string, workstationId?: string): number | null {
    const station = workstationId ?? this.workstationOf(product);
    return station === null ? null : (this.placements.get(product)?.get(station)?.position ?? null);
  }
}

/** Un poste en service. */
export function station(id: string, name: string, position: number): Workstation {
  return { id, name, position, archivedAt: null, trackingLevel: null };
}

/** Le personnel qui règle les postes, connu de l'annuaire. */
export const STAFF_ID = "staff_ws";

/** Les outils d'un handler des postes, tous doublés à la main. */
export function workstationTools(maps: InMemoryWorkstationMaps, now: Date) {
  const clock = new FixedClock(now);
  const events = new RecordingPublisher();
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Colette", lastName: "Martin", staffUserId: STAFF_ID }, STAFF_ID),
  );
  const gesture = new WorkstationMapGesture(maps, authors, events, clock, new DirectUnitOfWork());
  return { clock, events, gesture, intents: inMemoryIntents() };
}
