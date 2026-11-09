import { Injectable } from "@nestjs/common";

import { MailRefusedError } from "../../../requests/domain/errors/mail-request.errors.js";
import { MailNatures } from "../../../requests/domain/ports/mail-natures.js";
import {
  MarketingClearance,
  type MarketingClearanceQuery,
  type MarketingVerdict,
} from "../../../requests/domain/ports/marketing-clearance.js";
import { MarketingPreferenceReader } from "../../domain/ports/marketing-preference.reader.js";
import { MarketingAddresses } from "./marketing-addresses.js";
import { UnsubscribeLinks } from "./unsubscribe-links.js";

/**
 * **Le contrôle marketing, par le registre de préférence** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, règles 11 et 25,
 * B3) — le seul lecteur du registre au moment d'un envoi.
 *
 * - Transactionnel (ou modèle inconnu) : rien n'est lu, l'e-mail part.
 * - Marketing : seule une adresse `accepted` pour l'espace de l'e-mail le
 *   laisse partir ; `unsubscribed` → refus `unsubscribed` ; jamais demandé ou
 *   en attente de confirmation → refus `no_consent`.
 *
 * La clé de l'adresse se recalcule de l'adresse d'envoi, jamais lue sur la
 * fiche (`recipient_key` est nulle pour les fiches d'avant T1) : « pas de
 * clé » ne vaut jamais « envoyer ». L'empreinte, elle, compare aussi une
 * désinscription effacée.
 */
@Injectable()
export class PreferenceMarketingClearance extends MarketingClearance {
  constructor(
    private readonly natures: MailNatures,
    private readonly addresses: MarketingAddresses,
    private readonly preferences: MarketingPreferenceReader,
    private readonly links: UnsubscribeLinks,
  ) {
    super();
  }

  async verdictFor(query: MarketingClearanceQuery): Promise<MarketingVerdict> {
    if (this.natures.natureOf(query.template) !== "marketing") {
      return { kind: "transactional" };
    }
    const print = this.addresses.of(query.recipient).print;
    const status = await this.preferences.statusOf(query.space, print);
    if (status === "unsubscribed") {
      return { kind: "refused", code: "unsubscribed" };
    }
    if (status !== "accepted") {
      return { kind: "refused", code: "no_consent" };
    }
    const unsubscribeUrl = this.links.urlFor(query.space, query.recipient);
    if (unsubscribeUrl === null) {
      throw new MailRefusedError(
        `l'e-mail marketing « ${query.template} » ne peut pas porter de lien de désinscription : ` +
          `l'origine publique de l'espace « ${query.space} » n'est pas configurée dans cet ` +
          "environnement. Un e-mail marketing ne part jamais sans son pied.",
      );
    }
    return { kind: "cleared", marks: { unsubscribeUrl } };
  }
}
