import { PurchaseBinCandidate } from "../../../domain/entities/purchase-bin-candidate.js";
import { PurchaseVehicleCandidate } from "../../../domain/entities/purchase-vehicle-candidate.js";
import { PurchaseBinCandidateRepository } from "../../../domain/ports/purchase-bin-candidate.repository.js";
import { PurchaseVehicleCandidateRepository } from "../../../domain/ports/purchase-vehicle-candidate.repository.js";

/**
 * Les dépôts de la bibliothèque d'achat en mémoire : l'agrégat y est rangé
 * par son état, comme en base — une mutation après `save` ne fuit pas.
 */
export class InMemoryVehicleCandidates extends PurchaseVehicleCandidateRepository {
  readonly saved: PurchaseVehicleCandidate[] = [];
  private readonly byId = new Map<string, PurchaseVehicleCandidate>();

  constructor(...candidates: readonly PurchaseVehicleCandidate[]) {
    super();
    for (const candidate of candidates) {
      this.byId.set(candidate.id, PurchaseVehicleCandidate.restore(candidate.toState()));
    }
  }

  load(id: string): Promise<PurchaseVehicleCandidate | null> {
    const found = this.byId.get(id);
    return Promise.resolve(
      found === undefined ? null : PurchaseVehicleCandidate.restore(found.toState()),
    );
  }

  save(candidate: PurchaseVehicleCandidate): Promise<void> {
    this.saved.push(candidate);
    this.byId.set(candidate.id, PurchaseVehicleCandidate.restore(candidate.toState()));
    return Promise.resolve();
  }

  activeNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    return Promise.resolve(
      [...this.byId.values()].some((c) => c.inLibrary && c.name === name && c.id !== exceptId),
    );
  }
}

export class InMemoryBinCandidates extends PurchaseBinCandidateRepository {
  readonly saved: PurchaseBinCandidate[] = [];
  private readonly byId = new Map<string, PurchaseBinCandidate>();

  constructor(...candidates: readonly PurchaseBinCandidate[]) {
    super();
    for (const candidate of candidates) {
      this.byId.set(candidate.id, PurchaseBinCandidate.restore(candidate.toState()));
    }
  }

  load(id: string): Promise<PurchaseBinCandidate | null> {
    const found = this.byId.get(id);
    return Promise.resolve(
      found === undefined ? null : PurchaseBinCandidate.restore(found.toState()),
    );
  }

  save(candidate: PurchaseBinCandidate): Promise<void> {
    this.saved.push(candidate);
    this.byId.set(candidate.id, PurchaseBinCandidate.restore(candidate.toState()));
    return Promise.resolve();
  }

  activeNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    return Promise.resolve(
      [...this.byId.values()].some((c) => c.inLibrary && c.name === name && c.id !== exceptId),
    );
  }
}
