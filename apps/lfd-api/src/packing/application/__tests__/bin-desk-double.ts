import type { DeliveryBinFreeHalvesView, DeliveryPackingProposalView } from "@lfd/contracts";

import {
  BinDesk,
  type BinDeclarationRequest,
  type BinShareRequest,
  type DeskBin,
  type DeskCapacity,
} from "../../channels/delivery/index.js";

/**
 * Le guichet des bacs, joué par la livraison — en mémoire. Il tire des codes
 * dans l'ordre, retient ce qu'on lui demande, et refuse ce qu'on lui dit de
 * refuser : c'est la livraison qui décide, le colisage relaie.
 */
export class ScriptedBinDesk extends BinDesk {
  readonly declared: BinDeclarationRequest[] = [];
  readonly shared: BinShareRequest[] = [];
  readonly voided: string[] = [];
  readonly dead = new Set<string>();
  refusal: Error | null = null;
  /** Les entrées que « Proposer » rend ; vide par défaut. */
  proposedBins: DeliveryPackingProposalView["bins"] = [];
  grid: readonly DeskCapacity[] = [];
  halves: DeliveryBinFreeHalvesView["halves"] = [];
  private next = 0;

  declareBin(request: BinDeclarationRequest): Promise<DeskBin> {
    this.declared.push(request);
    return this.answer(request.half ? "left" : null);
  }

  shareHalf(request: BinShareRequest): Promise<DeskBin> {
    this.shared.push(request);
    return this.answer("right");
  }

  voidBin(binId: string): Promise<void> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.voided.push(binId);
    this.dead.add(binId);
    return Promise.resolve();
  }

  propose(orderId: string): Promise<DeliveryPackingProposalView> {
    return Promise.resolve({
      orderId,
      reference: `CMD-${orderId}`,
      lines: [],
      bins: this.proposedBins,
      unplaced: [],
      shareCandidate: null,
    });
  }

  capacities(): Promise<readonly DeskCapacity[]> {
    return Promise.resolve(this.grid);
  }

  freeHalves(orderId: string): Promise<DeliveryBinFreeHalvesView> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    return Promise.resolve({
      orderId,
      reference: `CMD-${orderId}`,
      round: null,
      halves: this.halves,
    });
  }

  /** Les bacs vus par « rouvrir » ; `refusal` les refuse tous. */
  readonly checkedAtHand: { readonly orderId: string; readonly binIds: readonly string[] }[] = [];

  assertAtHand(orderId: string, binIds: readonly string[]): Promise<void> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.checkedAtHand.push({ orderId, binIds });
    return Promise.resolve();
  }

  liveBins(binIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(binIds.filter((binId) => !this.dead.has(binId))));
  }

  private answer(half: DeskBin["half"]): Promise<DeskBin> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.next += 1;
    const index = String(this.next);
    return Promise.resolve({ binId: `bin_${index}`, code: `CODE0${index}`, half });
  }
}
