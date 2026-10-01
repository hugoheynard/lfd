import type { AddressDoorstepRuleView } from "@lfd/contracts";

/**
 * Port de **lecture** de la décision réglée d'avance d'une adresse
 * (`plan-a-la-porte.md`, B3 bis) — pour l'écran du commercial seul : la vue
 * des adresses, que le client lit aussi, ne la porte pas.
 *
 * 🔴 Le mur est dans la requête : l'adresse n'est lue que si elle est une
 * livraison NON archivée de CETTE société — sinon `null`.
 */
export abstract class DeliveryDoorstepRuleReader {
  abstract ruleOf(companyId: string, addressId: string): Promise<AddressDoorstepRuleView | null>;
}
