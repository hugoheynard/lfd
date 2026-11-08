import type { MailTemplateDeclaration } from "../mail-document.js";
import { startingMailDocument } from "../starting-document.js";
import { validateMailDocument } from "../validate-mail-document.js";

const ORDER_PLACED: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "summary", "image", "itinerary", "cta", "footer"],
  locales: ["fr", "en", "it"],
  charter: "lfc",
  nature: "transactional",
};

const sectionsOf = (blocks: readonly { readonly kind: string; readonly id: string }[]) =>
  blocks.map((block) => block.id);

describe("startingMailDocument", () => {
  it("sans ordre publié, rend les blocs du modèle dans l'ordre déclaré, sans bloc libre", () => {
    const document = startingMailDocument("customer.order-placed", ORDER_PLACED);

    expect(document.template).toBe("customer.order-placed");
    expect(sectionsOf(document.blocks)).toEqual([
      "model:title",
      "model:body",
      "model:summary",
      "model:image",
      "model:itinerary",
      "model:cta",
      "model:footer",
    ]);
    expect(document.blocks.every((block) => block.kind === "model")).toBe(true);
  });

  it("suit l'ordre publié, range le lien secondaire avec son bouton et complète ce qu'il ne nomme pas", () => {
    const document = startingMailDocument("customer.order-placed", ORDER_PLACED, [
      "secondaryLink",
      "summary",
      "cta",
      "title",
      "inconnue",
      "summary",
    ]);

    expect(sectionsOf(document.blocks)).toEqual([
      "model:cta",
      "model:summary",
      "model:title",
      "model:body",
      "model:image",
      "model:itinerary",
      "model:footer",
    ]);
  });

  it("écarte d'un ordre publié une section que le modèle ne déclare pas", () => {
    const declaration: MailTemplateDeclaration = {
      modelBlocks: ["title", "body"],
      locales: ["fr"],
      charter: "internal",
      nature: "transactional",
    };

    const document = startingMailDocument("ops.deploy-check", declaration, ["image", "body"]);

    expect(sectionsOf(document.blocks)).toEqual(["model:body", "model:title"]);
  });

  it("rend un document que les règles du serveur admettent", () => {
    const document = startingMailDocument("customer.order-placed", ORDER_PLACED, ["footer"]);

    expect(validateMailDocument(document, ORDER_PLACED, "customer.order-placed")).toEqual([]);
  });
});
