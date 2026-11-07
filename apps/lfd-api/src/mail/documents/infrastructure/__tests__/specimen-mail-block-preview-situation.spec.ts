import { startingMailDocument } from "@lfd/mail-blocks";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { PublishedChartersOnly } from "../../../templates/effective-copy/__tests__/published-charters.double.js";
import type { B2bMails } from "../../../templates/mail-templates.js";
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

const BLOCKS = new SpecimenMailBlockPreviewRenderer(
  new PreviewAppConfig(),
  new PublishedChartersOnly(),
);

/** § 24 (2026-11-07) : la situation passe le cas en retrait ou en livraison, sans autre cas. */
describe("l'aperçu par blocs dans une situation", () => {
  /** Le fragment de chaque bloc du modèle de l'e-mail, rendu dans cette situation. */
  async function sectionsIn(
    template: keyof B2bMails,
    situation: "pickup" | "delivery" | null,
  ): Promise<ReadonlyMap<string, string>> {
    const document = startingMailDocument(template, mailBlockDeclarationOf(template));
    const parts = await BLOCKS.render(
      template,
      "specimen",
      "fr",
      {},
      document,
      new Map(),
      situation,
    );
    const sectionOf = new Map(
      document.blocks.flatMap((block) =>
        block.kind === "model" ? [[block.id, block.section] as const] : [],
      ),
    );
    return new Map(
      parts.blocks.map((block) => [sectionOf.get(block.blockId) ?? block.blockId, block.html]),
    );
  }

  it.each(["customer.order-placed", "customer.order-ready"] as const)(
    "%s : l'itinéraire est vide en livraison, rendu en retrait, le QR reste",
    async (template) => {
      const delivery = await sectionsIn(template, "delivery");
      const pickup = await sectionsIn(template, "pickup");
      expect(delivery.get("itinerary")).toBe("");
      expect(pickup.get("itinerary")).toContain("google.com/maps");
      expect(delivery.get("image")).not.toBe("");
      expect(delivery.get("summary")).not.toBe("");
    },
  );

  it("rend le cas tel quel sans situation", async () => {
    expect(await sectionsIn("customer.order-placed", null)).toEqual(
      await sectionsIn("customer.order-placed", "pickup"),
    );
  });
});
