import type { CompanyAddressesView } from "@lfd/contracts";

/**
 * Port de **lecture** des adresses d'une entreprise. Vue dénormalisée, prête pour
 * l'écran : facturation (ou `null`) + livraisons non archivées, la défaut en tête.
 * Une lecture ne mute rien — rien à protéger côté écriture, seul le mur de tenancy
 * (appartenance à l'entreprise) est vérifié en amont par le handler.
 */
export abstract class CompanyAddressReader {
  abstract read(companyId: string): Promise<CompanyAddressesView>;
}
