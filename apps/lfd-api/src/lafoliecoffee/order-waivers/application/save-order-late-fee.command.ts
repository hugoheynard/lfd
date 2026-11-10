import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";

/** Pose ou remplace la surtaxe de commande tardive. */
export class SaveOrderLateFeeCommand {
  constructor(
    readonly setting: LateFeeSetting,
    readonly updatedBy: string,
  ) {}
}
