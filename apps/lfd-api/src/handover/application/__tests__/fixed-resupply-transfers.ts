import {
  type ResupplyOnlyTransferStatus,
  ResupplyTransfersReader,
} from "../../../delivery/channels/handover/index.js";

/** Les transferts de réassort seul, doublés (R3c, R3e) : ceux donnés, par journée. */
export class FixedResupplyTransfers extends ResupplyTransfersReader {
  readonly asked: string[] = [];

  constructor(private readonly transfers: readonly ResupplyOnlyTransferStatus[] = []) {
    super();
  }

  resupplyOnlyOn(serviceDay: string): Promise<readonly ResupplyOnlyTransferStatus[]> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.transfers);
  }
}
