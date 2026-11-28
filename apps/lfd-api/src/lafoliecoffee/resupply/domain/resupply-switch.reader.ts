import type { ResupplySwitch } from "./resupply-switch.js";

/**
 * Port de **lecture** de l'interrupteur : l'écran des réglages et les écrans
 * qui se masquent le lisent, le garde des écritures n'en demande que l'état.
 */
export abstract class ResupplySwitchReader {
  /** L'interrupteur posé ; `null` s'il ne l'a jamais été. */
  abstract read(): Promise<ResupplySwitch | null>;

  /** Le réassort est-il allumé ? Jamais posé vaut éteint. */
  abstract isEnabled(): Promise<boolean>;
}
