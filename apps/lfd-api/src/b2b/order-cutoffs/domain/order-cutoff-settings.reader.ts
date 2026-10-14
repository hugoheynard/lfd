import type { OrderCutoffSettingsView } from "@lfd/contracts";

/**
 * Port de **lecture** de l'interrupteur de l'heure limite générale. Distinct
 * du port d'écriture (ISP) : ceux qui servent les règles le lisent, ils ne le
 * posent jamais.
 */
export abstract class OrderCutoffSettingsReader {
  /** Le réglage courant ; ligne absente = `DEFAULT_ORDER_CUTOFF_SETTINGS` (activée). */
  abstract current(): Promise<OrderCutoffSettingsView>;
}
