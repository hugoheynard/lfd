import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { MailBrandCode } from "../../requests/domain/value-objects/mail-brand.js";
import { SpacePublicOrigins } from "../domain/ports/space-public-origins.js";

/**
 * L'origine publique de chaque espace, lue par `AppConfig` sans variable
 * neuve (plan de désinscription, contradiction : « l'hôte de chaque
 * espace ») : la boutique pour `lfc` (`CLIENT_BASE_URL`). Une table par
 * espace : un espace de plus est une ligne de plus, et une clé oubliée ne
 * compile pas.
 *
 * `lfd` n'a PAS d'origine : c'est l'espace de l'équipe, qui n'enverra jamais
 * de marketing (règle 19, décidé le 2026-11-08), et le domaine du back-office
 * (`lfd-backoffice.com`) est un CNAME vers Pages, hors de la passerelle — une
 * URL `/api/lfd/…` n'y mènerait nulle part (lu dans `gateway/wrangler.toml`
 * le 2026-11-08). `null` : aucun lien de désinscription ne se fabrique.
 */
@Injectable()
export class ConfigSpacePublicOrigins extends SpacePublicOrigins {
  private readonly origins: Readonly<Record<MailBrandCode, () => string | null>>;

  constructor(config: AppConfig) {
    super();
    this.origins = {
      lfc: () => config.clientBaseUrl(),
      lfd: () => null,
    };
  }

  originOf(space: MailBrandCode): string | null {
    const origin = this.origins[space]();
    return origin === null ? null : origin.replace(/\/+$/u, "");
  }
}
