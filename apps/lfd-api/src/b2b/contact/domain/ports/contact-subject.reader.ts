import type {
  ContactSubjectView,
  CustomerAudience,
  PublicContactSubjectView,
} from "@lfd/contracts";

/** Port de **lecture** des objets — pour l'écran de réglage et pour la boutique (ISP). */
export abstract class ContactSubjectReader {
  /** Les objets non archivés, par rang puis libellé. */
  abstract list(): Promise<ContactSubjectView[]>;
  /** Les objets actifs, non archivés, visibles pour ce public — sans adresse de destination. */
  abstract offeredTo(audience: CustomerAudience): Promise<PublicContactSubjectView[]>;
}
