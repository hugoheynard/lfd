import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import type { MarketingStatus } from "../value-objects/marketing-vocabulary.js";

/**
 * Port de LECTURE du registre (ISP : le contrôle à l'envoi de U3 ne lit
 * qu'un état, il n'écrit rien). Par empreinte, comme l'écriture.
 */
export abstract class MarketingPreferenceReader {
  /** L'état de cette empreinte dans cet espace ; `null` : jamais demandé. */
  abstract statusOf(space: MailBrandCode, print: string): Promise<MarketingStatus | null>;
}
