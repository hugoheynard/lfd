import type { ContactSettingsView } from "@lfd/contracts";

/** Port de **lecture** de la carte de contact (ISP : la boutique ne la pose jamais). */
export abstract class ContactSettingsReader {
  /** Le réglage courant ; personne n'a rien réglé = `DEFAULT_CONTACT_SETTINGS`. */
  abstract current(): Promise<ContactSettingsView>;
}
