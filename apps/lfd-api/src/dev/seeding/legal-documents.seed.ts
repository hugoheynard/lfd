import { DEMO_LEGAL_DOCUMENTS, legalMentionOrder, type LegalMention } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { AddLegalDocumentParagraphCommand } from "../../b2b/content/application/add-legal-document-paragraph.command.js";
import { SetLegalDocumentTitleCommand } from "../../b2b/content/application/set-legal-document-title.command.js";
import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * **Les cinq mentions légales de démonstration** — les documents que le
 * back-office et le dialogue de la boutique ont à montrer sur un poste neuf.
 *
 * Sans ce semis, les surfaces tombent sur le repli du contrat : elles ne sont
 * jamais vides, mais aucune ÉCRITURE n'a eu lieu, donc rien n'éprouve la ligne
 * en base, la révision, ni l'identifiant frappé par `IdGenerator`. Un poste où
 * l'on ne peut pas déplacer un article est un poste où l'écran de déplacement
 * n'a jamais été regardé.
 *
 * ## 🔴 Par les COMMANDES, jamais par Prisma
 *
 * Même raison que `station.seed.ts` : un seed qui contourne les handlers ne
 * prépare pas le produit, il prépare une base qui lui ressemble. Ici, l'écriture
 * directe poserait des identifiants lisibles là où le produit frappe des ULID,
 * et l'écran de démonstration ne montrerait donc pas ce que la production fait.
 *
 * La lecture, elle, reste directe : constater qu'une ligne existe n'engage
 * aucune règle.
 *
 * ## Le texte vient du CONTRAT, pas d'ici
 *
 * `DEMO_LEGAL_DOCUMENTS` est exporté pour ce semis précisément. Le recopier
 * aurait garanti que le corpus de démonstration et le repli du serveur divergent
 * au premier article corrigé d'un seul côté — et ce texte a une raison d'être
 * uniforme : **il dit lui-même qu'il n'a aucune valeur contractuelle**.
 */

/**
 * Qui a écrit, du point de vue de la colonne `updated_by`.
 *
 * Un libellé et non l'identifiant d'une fiche staff : sur un poste de
 * développement, personne n'a saisi ces documents, et inventer un auteur ferait
 * passer un corpus semé pour une saisie humaine.
 */
const SEED_AUTHOR = "semis de développement";

/**
 * La clé de ligne d'une mention, telle que l'adaptateur l'écrit.
 *
 * ⚠️ Elle est recopiée ici pour CONSTATER, jamais pour écrire — le semis n'écrit
 * que par le bus. La correspondance qui fait autorité est celle de
 * `PrismaPlatformContentRepository` ; une divergence ferait resemer un document
 * déjà présent, pas écrire au mauvais endroit (vérifié le 2026-09-13).
 */
const SEED_KEYS: Readonly<Record<LegalMention, string>> = {
  legalNotice: "legal-notice",
  salesTerms: "sales-terms",
  privacy: "privacy",
  cookies: "cookies",
  accessibility: "accessibility",
};

/** Ce dont le semis a besoin : le bus pour écrire, la base pour constater. */
export interface LegalDocumentsContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
}

/**
 * Sème les cinq documents de démonstration, **mention par mention**.
 *
 * **Tout ou rien, pour chacune** : la présence de sa ligne suffit à passer son
 * tour. À la différence de l'entité émettrice, il n'y a pas de valeur à
 * compléter — un document à demi semé n'existe pas, et repasser dessus
 * écraserait le travail d'un rédacteur qui a corrigé un article sur son poste.
 *
 * L'idempotence est par mention et non globale : une mention ajoutée au
 * vocabulaire se sème sur un poste qui porte déjà les autres, sans que personne
 * ait à vider la table.
 */
export async function seedLegalDocuments({
  prisma,
  commands,
}: LegalDocumentsContext): Promise<void> {
  for (const mention of legalMentionOrder) {
    await seedOne({ prisma, commands }, mention);
  }
}

/** Sème une mention si sa ligne est absente. */
async function seedOne(
  { prisma, commands }: LegalDocumentsContext,
  mention: LegalMention,
): Promise<void> {
  const demo = DEMO_LEGAL_DOCUMENTS[mention];
  const existing = await prisma.platformContent.findUnique({
    where: { key: SEED_KEYS[mention] },
  });
  if (existing) {
    console.log(`· ${demo.title.fr} — déjà présentes, inchangées.`);
    return;
  }

  await commands.execute(new SetLegalDocumentTitleCommand(mention, demo.title, SEED_AUTHOR));
  for (const prose of demo.paragraphs) {
    await commands.execute(new AddLegalDocumentParagraphCommand(mention, prose, SEED_AUTHOR));
  }

  console.log(`✓ ${demo.title.fr} — ${demo.paragraphs.length} articles de démonstration semés.`);
}
