import type { CustomerSheetView } from "@lfd/contracts";

/**
 * Port de **lecture** de la fiche client commerciale.
 *
 * Une seule méthode, et une **vue plate** : la fiche croise quatre tables
 * (société, commandes, abonnements, memberships) pour n'en tirer qu'un écran.
 * La reconstituer en agrégats pour la ré-aplatir aussitôt ne servirait personne —
 * c'est un chemin de lecture, pas une écriture (cf. la discipline CQRS).
 */
export abstract class CustomerSheetReader {
  /** La fiche d'une société, ou `null` si elle n'existe pas. */
  abstract read(companyId: string, now: Date): Promise<CustomerSheetView | null>;
}
