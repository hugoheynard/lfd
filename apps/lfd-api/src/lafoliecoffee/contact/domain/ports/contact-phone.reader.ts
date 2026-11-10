import type { ContactPhoneView, PublicContactPhoneView } from "@lfd/contracts";

/** Port de **lecture** des numéros — pour l'écran de réglage et pour la boutique (ISP). */
export abstract class ContactPhoneReader {
  /** Les numéros non archivés, par rang. */
  abstract list(): Promise<ContactPhoneView[]>;
  /** Les numéros actifs et non archivés, par rang — tous publics : la boutique filtre. */
  abstract published(): Promise<PublicContactPhoneView[]>;
}
