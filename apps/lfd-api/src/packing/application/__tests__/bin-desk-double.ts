import type { DeliveryPackingProposalView } from "@lfd/contracts";

import {
  BinDesk,
  type BinDeclarationRequest,
  type BinShareRequest,
  type DeskBin,
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
      bins: [],
      unplaced: [],
      shareCandidate: null,
    });
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
