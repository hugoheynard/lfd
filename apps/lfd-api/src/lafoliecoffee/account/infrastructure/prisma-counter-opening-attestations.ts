import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CounterOpeningAttestations } from "../domain/ports/counter-opening-attestations.js";
import type { IdentityAttestation } from "../domain/value-objects/identity-attestation.js";

/**
 * Range la trace d'ouverture d'un compte au comptoir. Une insertion, jamais
 * une mise à jour : la base refuse toute réécriture
 * (`counter_opening_attestations_append_only`).
 */
@Injectable()
export class PrismaCounterOpeningAttestations extends CounterOpeningAttestations {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(companyId: string, attestation: IdentityAttestation): Promise<void> {
    await this.prisma.counterOpeningAttestation.create({
      data: { companyId, ...attestation.toRecord() },
    });
  }
}
