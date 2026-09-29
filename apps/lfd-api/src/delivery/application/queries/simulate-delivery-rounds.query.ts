import type { DeliverySimulationPayload } from "@lfd/contracts";

/**
 * **Simuler** des tournées sur des arrêts inventés (plan de tournée, lot 9,
 * L9-C1) — une LECTURE : ni commande, ni tournée, ni géocodage.
 */
export class SimulateDeliveryRoundsQuery {
  constructor(readonly scenario: DeliverySimulationPayload) {}
}
