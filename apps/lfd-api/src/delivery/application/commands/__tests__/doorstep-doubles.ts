import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import {
  DoorstepHandoverAttestor,
  type DoorstepHandoverRequest,
  type DoorstepProofImages,
  type HandoverPublication,
  type StagedHandoverProofs,
} from "../../../channels/handover/index.js";
import {
  type DeliveryOrderState,
  DeliveryOrderStatesReader,
} from "../../../channels/commerce/index.js";
import type {
  DeliveryIncident,
  DeliveryIncidentState,
} from "../../../domain/entities/delivery-incident.js";
import { DoorstepStop, type DoorstepStopState } from "../../../domain/entities/doorstep-stop.js";
import { DeliveryIncidentRepository } from "../../../domain/ports/delivery-incident.repository.js";
import { DoorstepStopRepository } from "../../../domain/ports/doorstep-stop.repository.js";
import {
  type DriverRoundRow,
  DriverRoundsReader,
  type DriverRoundSummaryRow,
} from "../../../domain/ports/driver-rounds.reader.js";

/**
 * Les doubles de la porte (`a-la-porte.md`, lot A) — chacun hérite de son
 * port abstrait, et joue le mur du livreur en mémoire.
 */

/** Des arrêts « en base », sous le mur : un arrêt n'existe que pour le livreur de sa tournée. */
export class InMemoryDoorstepStops extends DoorstepStopRepository {
  readonly saves: string[] = [];
  private readonly rows = new Map<string, { state: DoorstepStopState; driver: string }>();

  constructor(driver: string, ...states: readonly DoorstepStopState[]) {
    super();
    for (const state of states) {
      this.rows.set(state.stopId, { state, driver });
    }
  }

  loadForDriver(
    roundId: string,
    stopId: string,
    staffUserId: string,
  ): Promise<DoorstepStop | null> {
    const row = this.rows.get(stopId);
    const mine =
      row !== undefined && row.driver === staffUserId && row.state.round.roundId === roundId;
    return Promise.resolve(mine ? DoorstepStop.restore(row.state) : null);
  }

  save(stop: DoorstepStop): Promise<void> {
    const row = this.rows.get(stop.stopId);
    if (row !== undefined && row.state.arrivedAt === null) {
      this.rows.set(stop.stopId, { ...row, state: { ...row.state, arrivedAt: stop.arrivedAt } });
    }
    this.saves.push(stop.stopId);
    return Promise.resolve();
  }

  arrivedAt(stopId: string): Date | null {
    return this.rows.get(stopId)?.state.arrivedAt ?? null;
  }
}

/** Les signalements écrits ; `failing` : l'écriture échoue (la transaction tombe). */
export class InMemoryIncidents extends DeliveryIncidentRepository {
  readonly recorded: DeliveryIncidentState[] = [];
  failing = false;

  record(incident: DeliveryIncident): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error("base en panne"));
    }
    this.recorded.push(incident.toSnapshot());
    return Promise.resolve();
  }
}

/** Le commerce, figé : l'état de chaque commande connue. */
export class FixedOrderStates extends DeliveryOrderStatesReader {
  constructor(private readonly states: readonly DeliveryOrderState[]) {
    super();
  }

  statesOf(orderIds: readonly string[]): Promise<readonly DeliveryOrderState[]> {
    return Promise.resolve(this.states.filter((state) => orderIds.includes(state.orderId)));
  }
}

/** Le bucket des pièces du fournil, en mémoire. */
export class InMemoryDocuments extends ProductionDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  readonly deleted: string[] = [];

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new Error(`pièce absente : ${key}`))
      : Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }
}

/** Le mur du livreur en lecture : une tournée n'existe que pour SON livreur. */
export class FixedDriverRounds extends DriverRoundsReader {
  constructor(
    private readonly driver: string,
    private readonly round: DriverRoundRow,
  ) {
    super();
  }

  roundsOf(): Promise<readonly DriverRoundSummaryRow[]> {
    return Promise.resolve([]);
  }

  roundOf(staffUserId: string, roundId: string): Promise<DriverRoundRow | null> {
    const mine = staffUserId === this.driver && roundId === this.round.id;
    return Promise.resolve(mine ? this.round : null);
  }
}

/**
 * Le retrait, doublé : il range, atteste, republie — et note tout. `refusal` :
 * l'attestation est refusée avec ce message ; `doorstep` : les commandes déjà
 * remises À LA PORTE, que le rejeu republie. Une publication rendue n'écrit
 * que dans `published` : c'est elle qui doit attendre la validation.
 */
export class ScriptedDoorstepAttestor extends DoorstepHandoverAttestor {
  readonly staged: DoorstepProofImages[] = [];
  readonly attested: DoorstepHandoverRequest[] = [];
  readonly discarded: StagedHandoverProofs[] = [];
  readonly published: string[] = [];
  refusal: string | null = null;
  readonly doorstep = new Set<string>();

  stageProofs(images: DoorstepProofImages): Promise<StagedHandoverProofs> {
    this.staged.push(images);
    const n = String(this.staged.length);
    return Promise.resolve({
      photoKey: `proofs/${n}/photo`,
      signatureKey: images.signature === null ? null : `proofs/${n}/signature`,
    });
  }

  attest(request: DoorstepHandoverRequest): Promise<HandoverPublication> {
    if (this.refusal !== null) {
      return Promise.reject(new RangeError(this.refusal));
    }
    this.attested.push(request);
    this.doorstep.add(request.orderId);
    return Promise.resolve(() => {
      this.published.push(`attested:${request.orderId}`);
    });
  }

  republication(orderId: string): Promise<HandoverPublication | null> {
    return Promise.resolve(
      this.doorstep.has(orderId)
        ? () => {
            this.published.push(`replayed:${orderId}`);
          }
        : null,
    );
  }

  discardProofs(staged: StagedHandoverProofs): Promise<void> {
    this.discarded.push(staged);
    return Promise.resolve();
  }
}
