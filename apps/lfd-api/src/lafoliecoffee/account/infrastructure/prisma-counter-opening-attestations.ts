import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CounterOpeningAttestations } from "../domain/ports/counter-opening-attestations.js";
import type { ContactSnapshot } from "../domain/value-objects/contact-details.js";
import type { IdentityAttestation } from "../domain/value-objects/identity-attestation.js";
import { counterBuyerGuestFile } from "./counter-buyer-guest-file.js";

/**
 * Range la trace d'ouverture d'un compte au comptoir, avec la fiche invité de
 * son acheteur. Une insertion, jamais une mise à jour : la base refuse toute
 * réécriture (`counter_opening_attestations_append_only`).
 */
@Injectable()
export class PrismaCounterOpeningAttestations extends CounterOpeningAttestations {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(
    companyId: string,
    attestation: IdentityAttestation,
    buyer: ContactSnapshot,
  ): Promise<void> {
    const buyerUserId = await counterBuyerGuestFile(this.prisma, buyer);
    await this.prisma.counterOpeningAttestation.create({
      data: { companyId, ...attestation.toRecord(), buyerUserId },
    });
  }
}
