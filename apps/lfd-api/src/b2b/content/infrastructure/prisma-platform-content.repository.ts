import {
  DEFAULT_FOOTER_CONTENT,
  footerContentSchema,
  type FooterContent,
  type FooterContentView,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";

/** La clé du bloc. Une constante et pas une chaîne en ligne : elle est un identifiant. */
const FOOTER_KEY = "footer";

@Injectable()
export class PrismaPlatformContentRepository extends PlatformContentRepository {
  private readonly logger = new Logger(PrismaPlatformContentRepository.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async readFooter(): Promise<FooterContentView> {
    const row = await this.prisma.platformContent.findUnique({ where: { key: FOOTER_KEY } });
    if (row === null) {
      return {
        content: DEFAULT_FOOTER_CONTENT,
        // Zéro et pas un : personne n'a encore rien écrit, et le back-office
        // doit pouvoir le dire au rédacteur plutôt que d'annoncer une première
        // révision qui n'a jamais eu lieu.
        revision: 0,
        updatedAt: new Date(0).toISOString(),
        updatedBy: null,
      };
    }
    return {
      content: this.parse(row.content),
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  async saveFooter(content: FooterContent, staffUserId: string): Promise<FooterContentView> {
    const row = await this.prisma.platformContent.upsert({
      where: { key: FOOTER_KEY },
      create: {
        key: FOOTER_KEY,
        content,
        revision: 1,
        updatedBy: staffUserId,
      },
      update: {
        content,
        // La révision date un GESTE, pas un contenu : elle monte même si le
        // texte est identique. C'est ce qui permet de dire « quelqu'un a
        // enregistré pendant que vous aviez l'écran ouvert ».
        revision: { increment: 1 },
        updatedBy: staffUserId,
      },
    });
    return {
      content: this.parse(row.content),
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  /**
   * Relit la colonne JSON à travers le schéma.
   *
   * ⚠️ Une colonne JSON n'a AUCUNE garantie de forme : ce qui y est écrit
   * aujourd'hui a été validé par la version du schéma de ce jour-là, et le
   * schéma bougera. Plutôt que de faire confiance et de casser un rendu de
   * vitrine sur une clé manquante, on relit — et on retombe sur le contenu de
   * départ si la ligne n'est plus lisible, en le DISANT dans les logs.
   */
  private parse(raw: unknown): FooterContent {
    const parsed = footerContentSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    this.logger.error(
      `Contenu « ${FOOTER_KEY} » illisible en base, repli sur le contenu de départ : ${parsed.error.message}`,
    );
    return DEFAULT_FOOTER_CONTENT;
  }
}
