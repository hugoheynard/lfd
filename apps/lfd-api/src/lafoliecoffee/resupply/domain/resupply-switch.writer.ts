import type { ResupplySwitch } from "./resupply-switch.js";

/** Port d'**écriture** de l'interrupteur : pose la ligne, ou la réécrit. */
export abstract class ResupplySwitchWriter {
  abstract put(setting: ResupplySwitch): Promise<void>;
}
