import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { type Workstation, WorkstationMap } from "../../domain/entities/workstation-map.js";
import {
  WorkstationMapRepository,
  type WorkstationMapStamp,
} from "../../domain/ports/workstation-map.repository.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";

/** Ce que le double a reçu à chaque `save` : la différence, et l'auteur. */
export interface SavedChanges {
  readonly workstations: readonly Workstation[];
  readonly placements: ReadonlyMap<string, string | null>;
  readonly stamp: WorkstationMapStamp;
}

/**
 * La carte des postes EN MÉMOIRE : `load` rend une carte neuve sur l'état
 * gardé, `save` y applique la différence — comme l'adaptateur Prisma, sans
 * la base ni le verrou.
 */
export class InMemoryWorkstationMaps extends WorkstationMapRepository {
  readonly saved: SavedChanges[] = [];
  private readonly stations = new Map<string, Workstation>();
  private readonly placements = new Map<string, string>();

  constructor(
    stations: readonly Workstation[] = [],
    placements: ReadonlyMap<string, string> = new Map(),
  ) {
    super();
    stations.forEach((station) => this.stations.set(station.id, station));
    placements.forEach((station, product) => this.placements.set(product, station));
  }

  load(): Promise<WorkstationMap> {
    return Promise.resolve(
      WorkstationMap.rehydrate({
        workstations: [...this.stations.values()],
        placements: new Map(this.placements),
      }),
    );
  }

  save(map: WorkstationMap, stamp: WorkstationMapStamp): Promise<void> {
    const changes = map.changes();
    this.saved.push({ ...changes, stamp });
    changes.workstations.forEach((station) => this.stations.set(station.id, station));
    changes.placements.forEach((station, product) => {
      if (station === null) {
        this.placements.delete(product);
      } else {
        this.placements.set(product, station);
      }
    });
    return Promise.resolve();
  }

  station(id: string): Workstation | undefined {
    return this.stations.get(id);
  }

  workstationOf(product: string): string | null {
    return this.placements.get(product) ?? null;
  }
}

/** Un poste en service. */
export function station(id: string, name: string, position: number): Workstation {
  return { id, name, position, archivedAt: null };
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
