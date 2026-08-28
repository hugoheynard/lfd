import { DEFAULT_FOOTER_CONTENT, type FooterContent, type FooterContentView } from "@lfd/contracts";

import { PlatformContentRepository } from "../../domain/platform-content.repository.js";
import { GetFooterContentHandler } from "../get-footer-content.handler.js";
import { GetFooterContentQuery } from "../get-footer-content.query.js";
import { SaveFooterContentCommand } from "../save-footer-content.command.js";
import { SaveFooterContentHandler } from "../save-footer-content.handler.js";

/** Un double du port — un objet qui implémente l'interface, pas un module moqué. */
class FakeContentRepository extends PlatformContentRepository {
  saved: { content: FooterContent; staffUserId: string } | null = null;
  revision = 0;

  async readFooter(): Promise<FooterContentView> {
    return {
      content: DEFAULT_FOOTER_CONTENT,
      revision: this.revision,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    };
  }

  async saveFooter(content: FooterContent, staffUserId: string): Promise<FooterContentView> {
    this.saved = { content, staffUserId };
    this.revision += 1;
    return {
      content,
      revision: this.revision,
      updatedAt: new Date(0).toISOString(),
      updatedBy: staffUserId,
    };
  }
}

describe("lire le pied de page", () => {
  it("aboutit toujours — il n'y a pas de cas « pas de contenu » à traiter", async () => {
    const repository = new FakeContentRepository();
    const view = await new GetFooterContentHandler(repository).execute(new GetFooterContentQuery());

    expect(view.content.fr.brand.tagline).not.toBe("");
    // Révision zéro : personne n'a encore écrit. C'est ce que l'écran d'édition
    // doit pouvoir dire, plutôt qu'annoncer une première révision fictive.
    expect(view.revision).toBe(0);
    expect(view.updatedBy).toBeNull();
  });
});

describe("enregistrer le pied de page", () => {
  it("transmet QUI écrit, et pas seulement quoi", async () => {
    const repository = new FakeContentRepository();
    await new SaveFooterContentHandler(repository).execute(
      new SaveFooterContentCommand(DEFAULT_FOOTER_CONTENT, "staff_42"),
    );

    expect(repository.saved?.staffUserId).toBe("staff_42");
  });

  it("fait monter la révision à chaque geste, même à texte identique", async () => {
    const repository = new FakeContentRepository();
    const handler = new SaveFooterContentHandler(repository);

    const first = await handler.execute(
      new SaveFooterContentCommand(DEFAULT_FOOTER_CONTENT, "staff_42"),
    );
    const second = await handler.execute(
      new SaveFooterContentCommand(DEFAULT_FOOTER_CONTENT, "staff_42"),
    );

    // Elle date un GESTE, pas un contenu : c'est ce qui permet de dire à un
    // rédacteur que quelqu'un a enregistré pendant qu'il avait l'écran ouvert.
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
  });

  it("rend l'état résultant, pas la charge envoyée", async () => {
    const repository = new FakeContentRepository();
    const view = await new SaveFooterContentHandler(repository).execute(
      new SaveFooterContentCommand(DEFAULT_FOOTER_CONTENT, "staff_7"),
    );

    expect(view.updatedBy).toBe("staff_7");
    expect(view.revision).toBe(1);
  });
});
