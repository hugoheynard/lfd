import { startingMailDocument, type MailBlock, type MailDocument } from "@lfd/mail-blocks";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { PublishedChartersOnly } from "../../../templates/effective-copy/__tests__/published-charters.double.js";
import { mailBlockDeclarationOf } from "../../../templates/sections/mail-block-declarations.js";
import { SpecimenMailBlockPreviewRenderer } from "../specimen-mail-block-preview.renderer.js";

/** Une config qui ne lit pas l'environnement : seule la marque des e-mails compte ici. */
class PreviewAppConfig extends AppConfig {
  override bootstrapAdminEmail(): string {
    return "admin@lfc.test";
  }

  override adminBaseUrl(): string | null {
    return "https://bo.lfc.test";
  }
}

const TEMPLATE = "customer.order-placed";

const COLUMNS: MailBlock = {
  id: "colonnes-1",
  kind: "columns",
  widths: [33, 67],
  cells: [
    [{ id: "gauche", kind: "heading", text: { fr: "À gauche" } }],
    [
      { id: "trait", kind: "divider" },
      { id: "droite", kind: "paragraph", text: { fr: "À droite <b>" } },
    ],
  ],
};

function documentWithColumns(): MailDocument {
  const starting = startingMailDocument(TEMPLATE, mailBlockDeclarationOf(TEMPLATE));
  return { ...starting, blocks: [COLUMNS, ...starting.blocks] };
}

/**
 * Le canevas glisse chaque bloc d'une colonne : il recevait la mise en page
 * en UNE table et la redécoupait lui-même ; le serveur rend désormais un
 * fragment par bloc de cellule, à côté de celui de la mise en page.
 */
describe("l'aperçu par blocs : les blocs rangés dans des colonnes", () => {
  const renderer = new SpecimenMailBlockPreviewRenderer(
    new PreviewAppConfig(),
    new PublishedChartersOnly(),
  );
  const render = () =>
    renderer.render(TEMPLATE, "specimen", "fr", {}, documentWithColumns(), new Map(), null);

  it("rend un fragment par bloc de cellule, identifié par l'id du bloc", async () => {
    const parts = await render();
    expect(parts.cellBlocks.map((block) => block.blockId)).toEqual(["gauche", "trait", "droite"]);
    expect(parts.cellBlocks[2]?.html).toContain(
      '<span data-free-block="droite" data-locale="fr">À droite &lt;b&gt;</span>',
    );
    expect(parts.cellBlocks[1]?.html).toContain("<hr");
  });

  it("la mise en page entière reste servie, et contient chaque fragment de cellule", async () => {
    const parts = await render();
    const layout = parts.blocks.find((block) => block.blockId === "colonnes-1")?.html ?? "";
    expect(layout).toContain("<table");
    for (const cell of parts.cellBlocks) {
      expect(layout).toContain(cell.html);
    }
  });
});
