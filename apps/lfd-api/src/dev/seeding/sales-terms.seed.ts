import { DEFAULT_SALES_TERMS, DEMO_SALES_TERMS_PARAGRAPHS } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { AddSalesTermsParagraphCommand } from "../../b2b/content/application/add-sales-terms-paragraph.command.js";
import { SetSalesTermsTitleCommand } from "../../b2b/content/application/set-sales-terms-title.command.js";
import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * **Les CGV de démonstration** — le document que le back-office et le dialogue
 * de la boutique ont à montrer sur un poste neuf.
 *
 * Sans ce semis, les deux surfaces tombent sur le repli du contrat : elles ne
 * sont jamais vides, mais aucune ÉCRITURE n'a eu lieu, donc rien n'éprouve la
 * ligne en base, la révision, ni l'identifiant frappé par `IdGenerator`. Un
 * poste où l'on ne peut pas déplacer un article est un poste où l'écran de
 * déplacement n'a jamais été regardé.
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
 * `DEMO_SALES_TERMS_PARAGRAPHS` est exporté pour ce semis précisément. Le
 * recopier aurait garanti que le corpus de démonstration et le repli du serveur
 * divergent au premier article corrigé d'un seul côté — et ce texte a une
 * raison d'être uniforme : **il dit lui-même qu'il n'a aucune valeur
 * contractuelle**.
 */

/** La clé du bloc, telle que l'adaptateur l'écrit. Elle sert ici à constater. */
const SALES_TERMS_KEY = "sales-terms";

/**
 * Qui a écrit, du point de vue de la colonne `updated_by`.
 *
 * Un libellé et non l'identifiant d'une fiche staff : sur un poste de
 * développement, personne n'a saisi ce document, et inventer un auteur ferait
 * passer un corpus semé pour une saisie humaine.
 */
const SEED_AUTHOR = "semis de développement";

/** Ce dont le semis a besoin : le bus pour écrire, la base pour constater. */
export interface SalesTermsContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
}

/**
 * Sème les CGV de démonstration si le bloc est absent.
 *
 * **Tout ou rien** : la présence de la ligne suffit à passer son tour. À la
 * différence de l'entité émettrice, il n'y a pas de valeur à compléter — un
 * document à demi semé n'existe pas, et repasser dessus écraserait le travail
 * d'un rédacteur qui a corrigé un article sur son poste.
 */
export async function seedSalesTerms({ prisma, commands }: SalesTermsContext): Promise<void> {
  const existing = await prisma.platformContent.findUnique({ where: { key: SALES_TERMS_KEY } });
  if (existing) {
    console.log("· Conditions générales de vente déjà présentes — inchangées.");
    return;
  }

  await commands.execute(new SetSalesTermsTitleCommand(DEFAULT_SALES_TERMS.title, SEED_AUTHOR));
  for (const prose of DEMO_SALES_TERMS_PARAGRAPHS) {
    await commands.execute(new AddSalesTermsParagraphCommand(prose, SEED_AUTHOR));
  }

  console.log(
    `✓ Conditions générales de vente semées — ${DEMO_SALES_TERMS_PARAGRAPHS.length} articles de démonstration.`,
  );
}
