import { Injectable } from "@nestjs/common";

import { FeatureLevelResolver } from "../../feature-access/application/feature-level.resolver.js";
import { CustomerMandateGate } from "../domain/ports/customer-mandate-gate.js";

/**
 * Le drapeau `customerMandate`, lu par la résolution de `feature-access`.
 *
 * Adaptateur plutôt qu'injection directe du résolveur dans les handlers : le
 * mandat n'a à connaître ni le catalogue, ni les niveaux. Et c'est la méthode
 * SANS sujet qui est appelée — le type refuse une clé qu'une exemption
 * pourrait ouvrir, donc aucune adresse de testeur n'ouvre un vrai mandat.
 */
@Injectable()
export class FeatureAccessCustomerMandateGate extends CustomerMandateGate {
  constructor(private readonly resolver: FeatureLevelResolver) {
    super();
  }

  async isOpen(): Promise<boolean> {
    return (await this.resolver.unexemptibleLevelOf("customerMandate")) === "open";
  }
}
