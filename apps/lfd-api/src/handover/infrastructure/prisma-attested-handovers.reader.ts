import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { AttestedHandoversReader } from "../../production/channels/handover/index.js";

/**
 * **Ce que la remise répond au fournil**, et rien d'autre.
 *
 * Un adaptateur séparé du dépôt d'écriture, alors que les deux lisent la même
 * table. Ce n'est pas de la cérémonie : le dépôt sert **l'agrégat** de la
 * remise, ce port sert **une question** que pose un autre contexte. Les fondre
 * ferait qu'élargir l'un élargirait l'autre — et c'est précisément comme ça que
 * le fournil s'était retrouvé à tenir un dépôt d'écriture entier pour compter
 * des références (cf. le commentaire laissé dans `OrderHandoverRepository`).
 *
 * ISP, dans le sens exact du §2 du `CLAUDE.md` : un consommateur ne dépend que
 * des méthodes qu'il appelle réellement.
 */
@Injectable()
export class PrismaAttestedHandoversReader extends AttestedHandoversReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async referencesAttestedSince(since: Date): Promise<readonly string[]> {
    const rows = await this.prisma.orderHandover.findMany({
      where: { handedOverAt: { gte: since } },
      select: { reference: true },
    });
    return rows.map((row) => row.reference);
  }
}
