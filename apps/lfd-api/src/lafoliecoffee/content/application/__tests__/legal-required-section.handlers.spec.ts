import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  LegalSectionAlreadyPresentError,
  LegalSectionNotRequiredError,
  RequiredLegalSectionRemovalError,
} from "../../domain/errors/legal-document-errors.js";
import { AddRequiredLegalSectionCommand } from "../add-required-legal-section.command.js";
import { AddRequiredLegalSectionHandler } from "../add-required-legal-section.handler.js";
import { EditLegalDocumentParagraphCommand } from "../edit-legal-document-paragraph.command.js";
import { EditLegalDocumentParagraphHandler } from "../edit-legal-document-paragraph.handler.js";
import { RemoveLegalDocumentParagraphCommand } from "../remove-legal-document-paragraph.command.js";
import { RemoveLegalDocumentParagraphHandler } from "../remove-legal-document-paragraph.handler.js";
import { FakeContentRepository, ids, prose } from "./fake-content.repository.js";

/** Crée la section de suppression des données de `privacy`, à la révision courante. */
async function withDataDeletion(repository = new FakeContentRepository()): Promise<string> {
  return new AddRequiredLegalSectionHandler(repository, new FixedIdGenerator("sec")).execute(
    new AddRequiredLegalSectionCommand(
      "privacy",
      "dataDeletion",
      prose("suppression"),
      repository.revision("privacy"),
      "staff_42",
    ),
  );
}

describe("créer une section requise", () => {
  it("pose la clé avec le texte SAISI, et rend l'identifiant frappé", async () => {
    const repository = new FakeContentRepository();

    const id = await withDataDeletion(repository);

    expect(id).toBe("sec_000001");
    expect(repository.content("privacy").paragraphs).toEqual([
      { id: "sec_000001", ...prose("suppression"), section: "dataDeletion" },
    ]);
  });

  it("refuse une section que la mention n'exige pas, sans rien enregistrer", async () => {
    const repository = new FakeContentRepository();

    await expect(
      new AddRequiredLegalSectionHandler(repository, new FixedIdGenerator("sec")).execute(
        new AddRequiredLegalSectionCommand("cookies", "dataDeletion", prose("x"), 0, "staff_42"),
      ),
    ).rejects.toBeInstanceOf(LegalSectionNotRequiredError);
    expect(repository.saves).toBe(0);
  });

  it("refuse une seconde section de même clé", async () => {
    const repository = new FakeContentRepository();
    await withDataDeletion(repository);

    await expect(withDataDeletion(repository)).rejects.toBeInstanceOf(
      LegalSectionAlreadyPresentError,
    );
    expect(ids(repository, "privacy")).toEqual(["sec_000001"]);
  });
});

describe("une section requise, une fois posée", () => {
  it("ne se supprime pas", async () => {
    const repository = new FakeContentRepository();
    const id = await withDataDeletion(repository);

    await expect(
      new RemoveLegalDocumentParagraphHandler(repository).execute(
        new RemoveLegalDocumentParagraphCommand(
          "privacy",
          id,
          repository.revision("privacy"),
          "staff_42",
        ),
      ),
    ).rejects.toBeInstanceOf(RequiredLegalSectionRemovalError);
    expect(ids(repository, "privacy")).toEqual([id]);
  });

  /**
   * Régression (plan confidentialité §4.5, B1) : `editParagraph` reconstruisait
   * le paragraphe depuis la charge utile, et la première correction effaçait
   * la clé — la section redevenait supprimable.
   */
  it("reste requise après une correction de son texte", async () => {
    const repository = new FakeContentRepository();
    const id = await withDataDeletion(repository);

    await new EditLegalDocumentParagraphHandler(repository).execute(
      new EditLegalDocumentParagraphCommand(
        "privacy",
        id,
        prose("suppression-v2"),
        repository.revision("privacy"),
        "staff_42",
      ),
    );

    expect(repository.content("privacy").paragraphs[0]).toMatchObject({
      id,
      section: "dataDeletion",
      fr: { title: "suppression-v2" },
    });
  });
});
