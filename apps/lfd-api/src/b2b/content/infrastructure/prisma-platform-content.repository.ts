import {
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_LEGAL_DOCUMENT,
  footerContentSchema,
  legalDocumentSchema,
  type FooterContent,
  type FooterContentView,
  type LegalDocument as LegalDocumentContent,
  type LegalDocumentView,
  type LegalMention,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LegalDocument } from "../domain/entities/legal-document.js";
import {
  LegalDocumentChangedError,
  UnreadableLegalDocumentError,
} from "../domain/errors/legal-document-errors.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";

/** La clé du bloc. Une constante et pas une chaîne en ligne : elle est un identifiant. */
const FOOTER_KEY = "footer";

/**
 * La clé de ligne de chaque mention — une **table de correspondance explicite**.
 *
 * 🔴 Et non une transformation de chaîne (`kebab` du nom de la mention) : une
 * dérivation mécanique lierait le nom d'un identifiant TypeScript à une clé de
 * stockage, et un renommage de vocabulaire, qui ne coûte rien, deviendrait une
 * migration de données silencieuse. Ici, renommer la mention laisse la clé
 * intacte tant qu'on n'a pas touché cette table.
 *
 * `sales-terms` est la clé qui existait avant les quatre autres et elle ne
 * bouge pas : ce sont des clés NEUVES dans une table à clé naturelle, d'où
 * l'absence de migration.
 */
const LEGAL_DOCUMENT_KEYS: Readonly<Record<LegalMention, string>> = {
  legalNotice: "legal-notice",
  salesTerms: "sales-terms",
  privacy: "privacy",
  cookies: "cookies",
  accessibility: "accessibility",
};

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

  async readLegalDocument(mention: LegalMention): Promise<LegalDocumentView> {
    const row = await this.prisma.platformContent.findUnique({
      where: { key: LEGAL_DOCUMENT_KEYS[mention] },
    });
    if (row === null) {
      return {
        content: DEFAULT_LEGAL_DOCUMENT(mention),
        revision: 0,
        updatedAt: new Date(0).toISOString(),
        updatedBy: null,
      };
    }
    return {
      content: this.parseLegalDocument(mention, row.content),
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  /**
   * Charge l'agrégat d'une mention, pour ÉCRIRE.
   *
   * Un document jamais enregistré se charge tel que la lecture le rend : le
   * titre de départ, aucun article, révision 0.
   *
   * ⚠️ **Ce repli doit rester le MÊME que celui de {@link readLegalDocument}.**
   * Ils ont divergé le temps d'une écriture — affichage sur la démonstration,
   * écriture sur le vide — et ça donnait un écran d'édition dont chaque ligne
   * répondait 404 : des articles qu'on voyait, qu'on ne pouvait ni corriger ni
   * supprimer, parce qu'ils n'avaient jamais existé (corrigé le 2026-09-13).
   * `DEFAULT_LEGAL_DOCUMENT` ne porte donc aucun article, et la démonstration
   * n'entre en base que par le semis.
   *
   * 🔴 En revanche, une ligne ILLISIBLE ne retombe pas sur ce repli ici, à la
   * différence de la lecture (plan `legal/plan-page-confidentialite.md` §4.5,
   * B3) : on réécrirait le document de production vide. Refus, rien n'est écrit.
   */
  async loadLegalDocument(
    mention: LegalMention,
    expectedRevision: number | undefined,
  ): Promise<LegalDocument> {
    const row = await this.prisma.platformContent.findUnique({
      where: { key: LEGAL_DOCUMENT_KEYS[mention] },
    });
    const content =
      row === null ? DEFAULT_LEGAL_DOCUMENT(mention) : this.parseForWrite(mention, row.content);
    if (expectedRevision === undefined) {
      // Transition : aucune révision annoncée, écriture non conditionnée.
      return LegalDocument.reconstitute(mention, content, null);
    }
    const revision = row?.revision ?? 0;
    if (revision !== expectedRevision) {
      throw new LegalDocumentChangedError(expectedRevision, content.title.fr);
    }
    return LegalDocument.reconstitute(mention, content, revision);
  }

  /**
   * Enregistre, conditionné à la révision chargée — un seul ordre SQL par cas.
   *
   * - révision 0 : le document n'existait pas. `createMany` + `skipDuplicates`
   *   n'insère rien si un collègue l'a créé entre-temps (`count` 0 → refus).
   * - sinon : `updateMany` sur `revision = chargée`. Deux enregistrements
   *   concurrents sur la même révision : Postgres sérialise, le second relit la
   *   ligne à jour et ne touche rien (`count` 0 → refus).
   */
  async saveLegalDocument(
    mention: LegalMention,
    document: LegalDocument,
    staffUserId: string,
  ): Promise<void> {
    const key = LEGAL_DOCUMENT_KEYS[mention];
    const content = document.snapshot();
    const expected = document.revision;
    if (expected === null) {
      await this.upsertUnconditioned(key, content, staffUserId);
      return;
    }
    const written =
      expected === 0
        ? await this.prisma.platformContent.createMany({
            data: [{ key, content, revision: 1, updatedBy: staffUserId }],
            skipDuplicates: true,
          })
        : await this.prisma.platformContent.updateMany({
            where: { key, revision: expected },
            // Comme le pied de page : la révision date un GESTE, pas un contenu.
            data: { content, revision: expected + 1, updatedBy: staffUserId },
          });
    if (written.count === 0) {
      throw new LegalDocumentChangedError(expected, content.title.fr);
    }
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
   * Même relecture, même repli, pour un document légal — cf. {@link parse}.
   *
   * Elle tient en plus ce que la base ne peut pas tenir : le schéma refuse deux
   * articles de même identifiant. Il n'y a pas d'index unique dans une colonne
   * JSON, donc sans cette relecture une modification viserait deux articles à
   * la fois et n'en changerait qu'un, en silence.
   */
  private parseLegalDocument(mention: LegalMention, raw: unknown): LegalDocumentContent {
    const parsed = legalDocumentSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    this.logger.error(
      `Contenu « ${LEGAL_DOCUMENT_KEYS[mention]} » illisible en base, repli sur le contenu de départ : ${parsed.error.message}`,
    );
    return DEFAULT_LEGAL_DOCUMENT(mention);
  }

  /**
   * L'écriture d'AVANT la révision attendue, gardée le temps que le
   * back-office en ligne l'envoie (2026-09-29). À retirer au resserrement.
   */
  private async upsertUnconditioned(
    key: string,
    content: LegalDocumentContent,
    staffUserId: string,
  ): Promise<void> {
    await this.prisma.platformContent.upsert({
      where: { key },
      create: { key, content, revision: 1, updatedBy: staffUserId },
      update: { content, revision: { increment: 1 }, updatedBy: staffUserId },
    });
  }

  /** La relecture pour ÉCRIRE : même schéma, mais un refus là où la lecture se replie. */
  private parseForWrite(mention: LegalMention, raw: unknown): LegalDocumentContent {
    const parsed = legalDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new UnreadableLegalDocumentError(LEGAL_DOCUMENT_KEYS[mention], parsed.error.message);
    }
    return parsed.data;
  }
}
