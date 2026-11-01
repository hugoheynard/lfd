import type { CustomerAudience } from "@lfd/contracts";

/**
 * Query : la carte de contact d'une audience **déclarée** — les particuliers
 * par défaut, les pros pour la vitrine pro (route publique, aucun principal).
 */
export class GetShopContactSettingsQuery {
  constructor(readonly audience: CustomerAudience) {}
}
