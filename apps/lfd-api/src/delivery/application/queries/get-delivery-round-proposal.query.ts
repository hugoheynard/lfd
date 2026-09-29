import type { ProposalMode } from "../../domain/value-objects/routing-settings.js";

/**
 * **Proposer** une composition pour un jour (lot 7, L7-C3 à C6) — une
 * LECTURE : elle n'écrit rien, et ne sort que vers la carte routière.
 */
export class GetDeliveryRoundProposalQuery {
  constructor(
    readonly day: string,
    /** Les véhicules cochés ; `null` : tous ceux qui roulent ce jour-là. */
    readonly vehicleIds: readonly string[] | null,
    /** « Tout recomposer » (L7-Q2) : aussi les tournées non parties et sans sac chargé. */
    readonly recomposeAll: boolean,
    /** `insert` ou `new_rounds` ; `null` : le mode par défaut des réglages. Ignoré si l'on recompose. */
    readonly mode: ProposalMode | null = null,
  ) {}
}
