import type { LateFeeSetting } from "../domain/late-fee-setting.js";

/** Pose ou remplace la surtaxe de commande tardive. */
export class SaveOrderLateFeeCommand {
  constructor(
    readonly setting: LateFeeSetting,
    readonly updatedBy: string,
  ) {}
}
