import {
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_SALES_TERMS,
  footerContentSchema,
  salesTermsSchema,
  type FooterContent,
  type FooterContentView,
  type SalesTerms,
  type SalesTermsView,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SalesTermsDocument } from "../domain/entities/sales-terms-document.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";

/** La clé du bloc. Une constante et pas une chaîne en ligne : elle est un identifiant. */
const FOOTER_KEY = "footer";

/** La clé du second bloc, même table, même révision. */
const SALES_TERMS_KEY = "sales-terms";

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

  async readSalesTerms(): Promise<SalesTermsView> {
    const row = await this.prisma.platformContent.findUnique({ where: { key: SALES_TERMS_KEY } });
    if (row === null) {
      return {
        content: DEFAULT_SALES_TERMS,
        revision: 0,
        updatedAt: new Date(0).toISOString(),
        updatedBy: null,
      };
    }
    return {
      content: this.parseSalesTerms(row.content),
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  /**
   * Charge l'agrégat.
   *
   * Un document jamais enregistré se charge tel que la lecture le rend : le
   * titre de départ, et aucun article.
   *
   * ⚠️ **Ce repli doit rester le MÊME que celui de {@link readSalesTerms}.** Ils
   * ont divergé le temps d'une écriture — affichage sur la démonstration,
   * écriture sur le vide — et ça donnait un écran d'édition dont chaque ligne
   * répondait 404 : des articles qu'on voyait, qu'on ne pouvait ni corriger ni
   * supprimer, parce qu'ils n'avaient jamais existé (corrigé le 2026-09-13).
   * `DEFAULT_SALES_TERMS` ne porte donc plus d'article du tout, et la
   * démonstration n'entre en base que par le semis.
   */
  async loadSalesTerms(): Promise<SalesTermsDocument> {
    const row = await this.prisma.platformContent.findUnique({ where: { key: SALES_TERMS_KEY } });
    if (row === null) {
      return SalesTermsDocument.reconstitute(DEFAULT_SALES_TERMS);
    }
    return SalesTermsDocument.reconstitute(this.parseSalesTerms(row.content));
  }

  async saveSalesTerms(document: SalesTermsDocument, staffUserId: string): Promise<void> {
    const content = document.snapshot();
    await this.prisma.platformContent.upsert({
      where: { key: SALES_TERMS_KEY },
      create: { key: SALES_TERMS_KEY, content, revision: 1, updatedBy: staffUserId },
      update: {
        content,
        // Comme le pied de page : la révision date un GESTE, pas un contenu.
        revision: { increment: 1 },
        updatedBy: staffUserId,
      },
    });
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

  /**
   * Même relecture, même repli, pour les CGV — cf. {@link parse}.
   *
   * Elle tient en plus ce que la base ne peut pas tenir : le schéma refuse deux
   * articles de même identifiant. Il n'y a pas d'index unique dans une colonne
   * JSON, donc sans cette relecture une modification viserait deux articles à
   * la fois et n'en changerait qu'un, en silence.
   */
  private parseSalesTerms(raw: unknown): SalesTerms {
    const parsed = salesTermsSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    this.logger.error(
      `Contenu « ${SALES_TERMS_KEY} » illisible en base, repli sur le contenu de départ : ${parsed.error.message}`,
    );
    return DEFAULT_SALES_TERMS;
  }
}
