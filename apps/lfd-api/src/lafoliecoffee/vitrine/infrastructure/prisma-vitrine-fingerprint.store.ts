import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VitrineFingerprintStore } from "../domain/ports/vitrine-fingerprint.store.js";
import type {
  VitrineElementKind,
  VitrineElementPrint,
} from "../domain/services/vitrine-fingerprints.js";

const KINDS: readonly VitrineElementKind[] = ["item", "operation", "shelf", "text"];

/**
 * Adaptateur Prisma des empreintes émises. Les lignes d'éléments retirés
 * s'effacent : c'est une table de suivi, pas un agrégat métier — la trace de
 * ce qui est parti vit dans `vitrine_deliveries`.
 */
@Injectable()
export class PrismaVitrineFingerprintStore extends VitrineFingerprintStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(subscriberId: string): Promise<readonly VitrineElementPrint[]> {
    const rows = await this.prisma.vitrineFingerprint.findMany({ where: { subscriberId } });
    return rows.flatMap((row) => {
      const kind = KINDS.find((candidate) => candidate === row.kind);
      // Un genre inconnu (CHECK contourné) est oublié : il sera réémis comme neuf.
      return kind === undefined
        ? []
        : [{ kind, key: row.elementKey, fingerprint: row.fingerprint }];
    });
  }

  async record(
    subscriberId: string,
    upserts: readonly VitrineElementPrint[],
    removals: readonly Pick<VitrineElementPrint, "kind" | "key">[],
    at: Date,
  ): Promise<void> {
    for (const print of upserts) {
      const id = { subscriberId, kind: print.kind, elementKey: print.key };
      await this.prisma.vitrineFingerprint.upsert({
        where: { subscriberId_kind_elementKey: id },
        create: { ...id, fingerprint: print.fingerprint, emittedAt: at },
        update: { fingerprint: print.fingerprint, emittedAt: at },
      });
    }
    if (removals.length > 0) {
      await this.prisma.vitrineFingerprint.deleteMany({
        where: {
          subscriberId,
          OR: removals.map((removal) => ({ kind: removal.kind, elementKey: removal.key })),
        },
      });
    }
  }

  async forget(subscriberId: string): Promise<void> {
    await this.prisma.vitrineFingerprint.deleteMany({ where: { subscriberId } });
  }
}
