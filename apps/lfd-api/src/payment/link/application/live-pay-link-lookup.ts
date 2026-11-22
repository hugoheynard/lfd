import { Injectable } from "@nestjs/common";

import type { PayLink } from "../domain/entities/pay-link.js";
import { PayLinkNotFoundError } from "../domain/errors/pay-link-errors.js";
import { PayLinkTokenVault } from "../domain/ports/pay-link-token-vault.js";
import { PayLinkRepository } from "../domain/ports/pay-link.repository.js";

/**
 * **Le lien vivant d'un jeton**, partagé par la vue et l'intention : un jeton
 * inconnu et un lien révoqué rendent le MÊME refus.
 */
@Injectable()
export class LivePayLinkLookup {
  constructor(
    private readonly links: PayLinkRepository,
    private readonly vault: PayLinkTokenVault,
  ) {}

  /** @throws {PayLinkNotFoundError} jeton inconnu ou lien révoqué. */
  async of(token: string): Promise<PayLink> {
    const link = await this.links.byTokenHash(this.vault.fingerprint(token));
    if (link === null || !link.isLive) {
      throw new PayLinkNotFoundError();
    }
    return link;
  }
}
