import type { VehicleView } from "@lfd/contracts";

import {
  type DepartureCandidate,
  DepartureCandidatesReader,
} from "../../../channels/commerce/index.js";
import type { DeliveryAuthor } from "../../../domain/entities/departure-choice.js";
import {
  DeliveryProposalRepository,
  type ProposalWrite,
} from "../../../domain/ports/delivery-proposal.repository.js";
import {
  DeliveryRoundsReader,
  type RoundRow,
} from "../../../domain/ports/delivery-rounds.reader.js";
import { DepartureReader } from "../../../domain/ports/departure.reader.js";
import { FleetReader } from "../../../domain/ports/fleet.reader.js";
import { GeocodeCacheReader } from "../../../domain/ports/geocode-cache.reader.js";
import { GeocodeCacheRepository } from "../../../domain/ports/geocode-cache.repository.js";
import {
  type GeocodeAnswer,
  Geocoder,
  type GeocodeRequest,
} from "../../../domain/ports/geocoder.js";
import { RoutingSettingsReader } from "../../../domain/ports/routing-settings.reader.js";
import { RoutingSettingsRepository } from "../../../domain/ports/routing-settings.repository.js";
import type { GeoPoint } from "../../../domain/value-objects/geo-point.js";
import type { RoutingSettings } from "../../../domain/value-objects/routing-settings.js";
import type { InMemoryDeliveryRounds } from "./round-doubles.js";

/** Les réglages du calcul en mémoire : lus et écrits dans la même case. */
export class InMemoryRoutingSettings extends RoutingSettingsReader {
  readonly writer: RoutingSettingsRepository;
  readonly written: { readonly settings: RoutingSettings; readonly author: DeliveryAuthor }[] = [];

  constructor(private stored: RoutingSettings | null = null) {
    super();
    const record = (settings: RoutingSettings, author: DeliveryAuthor): void => {
      this.stored = settings;
      this.written.push({ settings, author });
    };
    this.writer = new (class extends RoutingSettingsRepository {
      put(settings: RoutingSettings, _at: Date, author: DeliveryAuthor): Promise<void> {
        record(settings, author);
        return Promise.resolve();
      }
    })();
  }

  current(): Promise<RoutingSettings | null> {
    return Promise.resolve(this.stored);
  }
}

/** Le cache du géocodage en mémoire, par clé ; les entrées sont toutes fraîches. */
export class InMemoryGeocodeCache extends GeocodeCacheReader {
  readonly writer: GeocodeCacheRepository;
  private readonly entries = new Map<string, GeoPoint>();

  constructor(initial: Readonly<Record<string, GeoPoint>> = {}) {
    super();
    for (const [key, point] of Object.entries(initial)) {
      this.entries.set(key, point);
    }
    const entries = this.entries;
    this.writer = new (class extends GeocodeCacheRepository {
      put(answers: readonly GeocodeAnswer[]): Promise<void> {
        for (const answer of answers) {
          if (answer.point !== null) {
            entries.set(answer.key, answer.point);
          }
        }
        return Promise.resolve();
      }
    })();
  }

  find(keys: readonly string[]): Promise<ReadonlyMap<string, GeoPoint>> {
    return Promise.resolve(
      new Map(
        keys.flatMap((key) => {
          const point = this.entries.get(key);
          return point === undefined ? [] : [[key, point] as const];
        }),
      ),
    );
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Un géocodeur qui note ce qu'on lui demande, et répond ce qu'on lui a dit. */
export class RecordingGeocoder extends Geocoder {
  readonly asked: (readonly GeocodeRequest[])[] = [];

  constructor(
    private readonly answer: (request: GeocodeRequest) => GeoPoint | null,
    private readonly failure: Error | null = null,
  ) {
    super();
  }

  geocode(requests: readonly GeocodeRequest[]): Promise<readonly GeocodeAnswer[]> {
    this.asked.push(requests);
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(
      requests.map((request) => ({ key: request.key, point: this.answer(request), score: 0.9 })),
    );
  }
}

/** La flotte, figée. */
export class FixedFleet extends FleetReader {
  constructor(private readonly vehicles: readonly VehicleView[]) {
    super();
  }

  list(): Promise<readonly VehicleView[]> {
    return Promise.resolve(this.vehicles);
  }
}

export function vehicleView(
  id: string,
  name: string,
  retiredAt: string | null = null,
): VehicleView {
  return {
    id,
    name,
    plate: "AB-123-CD",
    retiredAt,
    createdAt: new Date(0).toISOString(),
    cargo: null,
    wheelArches: null,
    refrigeration: null,
    energy: null,
  };
}

/** La vue du jour lue sur les tournées en mémoire — la même source que l'écriture. */
export class RoundsReaderOver extends DeliveryRoundsReader {
  constructor(private readonly rounds: InMemoryDeliveryRounds) {
    super();
  }

  roundsOn(serviceDay: string): Promise<readonly RoundRow[]> {
    return Promise.resolve(
      this.rounds
        .all()
        .filter((round) => round.serviceDay === serviceDay)
        .map((round) => ({
          id: round.id,
          vehicleId: round.vehicleId,
          vehicleName: round.vehicleName,
          passage: round.passage,
          driverStaffId: round.driverStaffId,
          returnedAt: round.returnedAt,
          version: round.version,
          vehicleRetiredAt: null,
          departedAt: round.departedAt,
          stops: round.liveStops.map((stop, index) => ({
            stopId: stop.id,
            orderId: stop.orderId,
            position: index + 1,
          })),
        })),
    );
  }

  composedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    const live = new Set(this.rounds.all().flatMap((round) => round.orderIds));
    return Promise.resolve(new Set(orderIds.filter((orderId) => live.has(orderId))));
  }
}

/** L'application d'une proposition, écrite tournée par tournée dans la mémoire — version exigée. */
export class InMemoryProposals extends DeliveryProposalRepository {
  readonly applied: ProposalWrite[] = [];

  constructor(private readonly rounds: InMemoryDeliveryRounds) {
    super();
  }

  async applyProposal(write: ProposalWrite): Promise<void> {
    for (const round of write.rounds) {
      await this.rounds.save(round);
    }
    this.applied.push(write);
  }
}

/** Le départ : un point de retrait, avec ou sans GPS. */
export class FixedDeparture extends DepartureCandidatesReader {
  readonly reader: DepartureReader = new (class extends DepartureReader {
    chosenPickupAddressId(): Promise<string | null> {
      return Promise.resolve(null);
    }
  })();

  constructor(private readonly gps: GeoPoint | null) {
    super();
  }

  list(): Promise<readonly DepartureCandidate[]> {
    return Promise.resolve([
      {
        pickupAddressId: "labo",
        label: "Laboratoire",
        address: {
          label: "Laboratoire",
          ligne1: "1 rue du Four",
          ligne2: "",
          codePostal: "73000",
          ville: "Chambéry",
          pays: "France",
        },
        gps: this.gps,
        isDefault: true,
      },
    ]);
  }
}
