import type { OrderCutoffSettingsView } from "@lfd/contracts";

/**
 * Port de **lecture** du jour même. Distinct du port d'écriture (ISP) : ceux
 * qui proposent ou acceptent une journée le lisent, ils ne le posent jamais.
 */
export abstract class OrderCutoffSettingsReader {
  /** Le réglage courant ; ligne absente = `DEFAULT_ORDER_CUTOFF_SETTINGS` (jour même fermé). */
  abstract current(): Promise<OrderCutoffSettingsView>;
}
