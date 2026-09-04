import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";

/** Pose ou remplace la surtaxe de commande tardive. */
export class SaveOrderLateFeeCommand {
  constructor(
    readonly setting: LateFeeSetting,
    readonly updatedBy: string,
  ) {}
}

/** Retire la surtaxe — les dérogations redeviennent gratuites. */
export class ClearOrderLateFeeCommand {}

/** Le réglage courant, ou `null`. */
export class ReadOrderLateFeeQuery {}
