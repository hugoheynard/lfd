import { DEMO_LEGAL_DOCUMENTS } from "@lfd/contracts";

import { AddLegalDocumentParagraphCommand } from "../../lafoliecoffee/content/application/add-legal-document-paragraph.command.js";
import { SetLegalDocumentTitleCommand } from "../../lafoliecoffee/content/application/set-legal-document-title.command.js";
import { SALES_TERMS_ROW_KEYS } from "../../lafoliecoffee/content/infrastructure/legal-document-file.mapper.js";
import { asStaff, SEED_STAFF_SUB, type SeedContext } from "./order-placing.seed.js";

/** Le texte que le semis publie : les CGV des professionnels. */
const PRO_SALES_TERMS = "salesTermsPro";

/**
 * **Les CGV des professionnels, publiées si elles ne le sont pas** — par les
 * vraies commandes de l'éditeur, comme le staff les rédige.
 *
 * Un panier récurrent ne s'ouvre pas sans CGV publiées pour la clientèle de
 * son acheteur (`subscriptions.sales_terms.unpublished`), et le semis des
 * mentions légales (`legal-documents.seed.ts`) ne connaît que les six
 * mentions du pied de page. Le texte reprend celui des CGV de démonstration
 * des particuliers : un texte de démo, pas une rédaction.
 *
 * Idempotent : un texte déjà présent — semé ou rédigé à la main — est laissé
 * tel quel.
 */
export async function ensureProSalesTerms(context: SeedContext): Promise<void> {
  const existing = await context.prisma.platformContent.findUnique({
    where: { key: SALES_TERMS_ROW_KEYS[PRO_SALES_TERMS] },
    select: { revision: true },
  });
  if (existing !== null) {
    return;
  }
  const demo = DEMO_LEGAL_DOCUMENTS.salesTerms;
  let revision = 0;
  await asStaff(context.now, async () => {
    await context.commands.execute(
      new SetLegalDocumentTitleCommand(PRO_SALES_TERMS, demo.title, revision++, SEED_STAFF_SUB),
    );
    for (const prose of demo.paragraphs) {
      await context.commands.execute(
        new AddLegalDocumentParagraphCommand(PRO_SALES_TERMS, prose, revision++, SEED_STAFF_SUB),
      );
    }
  });
}
