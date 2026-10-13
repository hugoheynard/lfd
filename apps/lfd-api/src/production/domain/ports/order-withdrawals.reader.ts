import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Les commandes retirées d'une journée** — port de LECTURE, distinct du
 * registre (ISP) : la clôture et le retirage lisent, ils n'écrivent pas de
 * retrait. Lu SOUS le verrou de la journée, après son rechargement (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4).
 */
export abstract class OrderWithdrawalsReader {
  abstract withdrawnOn(day: ServiceDay): Promise<ReadonlySet<string>>;
}
