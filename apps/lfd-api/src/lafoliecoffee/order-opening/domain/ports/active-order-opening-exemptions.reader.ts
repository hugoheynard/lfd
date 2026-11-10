import type { OrderOpeningExemption } from "../order-opening-exemption.js";

/**
 * Port de **lecture** des exemptions actives, en agrégats : la passation les
 * oppose à qui commande, et l'ajout y cherche un doublon. Distinct du port
 * d'écriture (ISP) : la passation ne pose ni ne retire jamais une exemption.
 */
export abstract class ActiveOrderOpeningExemptions {
  abstract active(): Promise<readonly OrderOpeningExemption[]>;
}
