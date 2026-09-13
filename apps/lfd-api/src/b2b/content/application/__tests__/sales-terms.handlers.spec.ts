import {
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_SALES_TERMS,
  type FooterContent,
  type FooterContentView,
  type SalesTerms,
  type SalesTermsParagraphPayload,
  type SalesTermsView,
} from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { SalesTermsDocument } from "../../domain/entities/sales-terms-document.js";
import {
  SalesTermsPositionOutOfRangeError,
  UnknownSalesTermsParagraphError,
} from "../../domain/errors/sales-terms-errors.js";
import { PlatformContentRepository } from "../../domain/platform-content.repository.js";
import { AddSalesTermsParagraphCommand } from "../add-sales-terms-paragraph.command.js";
import { AddSalesTermsParagraphHandler } from "../add-sales-terms-paragraph.handler.js";
import { EditSalesTermsParagraphCommand } from "../edit-sales-terms-paragraph.command.js";
import { EditSalesTermsParagraphHandler } from "../edit-sales-terms-paragraph.handler.js";
import { GetSalesTermsHandler } from "../get-sales-terms.handler.js";
import { MoveSalesTermsParagraphCommand } from "../move-sales-terms-paragraph.command.js";
import { MoveSalesTermsParagraphHandler } from "../move-sales-terms-paragraph.handler.js";
import { RemoveSalesTermsParagraphCommand } from "../remove-sales-terms-paragraph.command.js";
import { RemoveSalesTermsParagraphHandler } from "../remove-sales-terms-paragraph.handler.js";
import { SetSalesTermsTitleCommand } from "../set-sales-terms-title.command.js";
import { SetSalesTermsTitleHandler } from "../set-sales-terms-title.handler.js";

/** Un article reconnaissable à son mot-clé, dans les trois langues. */
function prose(word: string): SalesTermsParagraphPayload {
  return {
    fr: { title: word, body: `Corps ${word}` },
    en: { title: word, body: `Body ${word}` },
    it: { title: word, body: `Corpo ${word}` },
  };
}

/**
 * Un double du port — une classe qui étend l'abstraite, pas un module moqué.
 *
 * Il tient l'état en mémoire sous la forme d'un `SalesTerms`, exactement comme
 * l'adaptateur tient une colonne JSON : c'est ce qui fait que `load → save` s'y
 * comporte comme en base, révision comprise.
 */
class FakeContentRepository extends PlatformContentRepository {
  saves = 0;
  lastAuthor: string | null = null;

  constructor(private stored: SalesTerms | null = null) {
    super();
  }

  get content(): SalesTerms {
    return this.stored ?? { title: DEFAULT_SALES_TERMS.title, paragraphs: [] };
  }

  readFooter(): Promise<FooterContentView> {
    return Promise.resolve({
      content: DEFAULT_FOOTER_CONTENT,
      revision: 0,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    });
  }

  saveFooter(content: FooterContent, staffUserId: string): Promise<FooterContentView> {
    return Promise.resolve({
      content,
      revision: 1,
      updatedAt: new Date(0).toISOString(),
      updatedBy: staffUserId,
    });
  }

  readSalesTerms(): Promise<SalesTermsView> {
    return Promise.resolve({
      // Le repli d'AFFICHAGE : jamais `null`, jamais vide.
      content: this.stored ?? DEFAULT_SALES_TERMS,
      revision: this.stored === null ? 0 : this.saves,
      updatedAt: new Date(0).toISOString(),
      updatedBy: this.lastAuthor,
    });
  }

  loadSalesTerms(): Promise<SalesTermsDocument> {
    return Promise.resolve(SalesTermsDocument.reconstitute(this.content));
  }

  saveSalesTerms(document: SalesTermsDocument, staffUserId: string): Promise<void> {
    this.stored = document.snapshot();
    this.saves += 1;
    this.lastAuthor = staffUserId;
    return Promise.resolve();
  }
}

const ids = (repository: FakeContentRepository): string[] =>
  repository.content.paragraphs.map((paragraph) => paragraph.id);

describe("lire les CGV", () => {
  it("aboutit toujours — il n'y a pas de cas « pas de document » à traiter", async () => {
    const view = await new GetSalesTermsHandler(new FakeContentRepository()).execute();

    // Aboutir n'est pas rendre quelque chose à lire : le document de départ
    // porte un TITRE, et aucun article. Les deux surfaces savent dire « pas
    // encore publiées » ; aucune n'a à traiter une absence de réponse.
    expect(view.revision).toBe(0);
    expect(view.content.title.fr).not.toBe("");
    expect(view.content.paragraphs).toEqual([]);
  });
});

describe("renommer le document", () => {
  it("enregistre le nouveau titre et transmet QUI écrit", async () => {
    const repository = new FakeContentRepository();
    await new SetSalesTermsTitleHandler(repository).execute(
      new SetSalesTermsTitleCommand({ fr: "CGV", en: "T&C", it: "CGV it" }, "staff_42"),
    );

    expect(repository.content.title.fr).toBe("CGV");
    expect(repository.lastAuthor).toBe("staff_42");
  });
});

describe("ajouter un article", () => {
  it("rend l'identifiant frappé par le port, et rien d'autre", async () => {
    const repository = new FakeContentRepository();
    const handler = new AddSalesTermsParagraphHandler(repository, new FixedIdGenerator("art"));

    const id = await handler.execute(new AddSalesTermsParagraphCommand(prose("objet"), "staff_42"));

    // L'écran a besoin de désigner ce qu'il vient d'ajouter ; le document, lui,
    // se relit — une commande ne rend pas de modèle de lecture.
    expect(id).toBe("art_000001");
    expect(ids(repository)).toEqual(["art_000001"]);
  });

  it("prend un identifiant NEUF à chaque ajout, jamais dérivé du titre", async () => {
    const repository = new FakeContentRepository();
    const handler = new AddSalesTermsParagraphHandler(repository, new FixedIdGenerator("art"));

    await handler.execute(new AddSalesTermsParagraphCommand(prose("objet"), "staff_42"));
    await handler.execute(new AddSalesTermsParagraphCommand(prose("objet"), "staff_42"));

    // Deux articles homonymes : c'est exactement le cas qu'un identifiant
    // dérivé du titre écraserait.
    expect(ids(repository)).toEqual(["art_000001", "art_000002"]);
  });

  it("ajoute AU DOCUMENT ENREGISTRÉ, pas au repli d'affichage", async () => {
    const repository = new FakeContentRepository();
    const handler = new AddSalesTermsParagraphHandler(repository, new FixedIdGenerator("art"));

    await handler.execute(new AddSalesTermsParagraphCommand(prose("objet"), "staff_42"));

    // Le repli de lecture porte les articles de démonstration ; les charger à
    // l'écriture les ferait persister sous des identifiants que le produit ne
    // frappe jamais.
    expect(ids(repository)).toEqual(["art_000001"]);
  });
});

describe("modifier, retirer, déplacer", () => {
  /** Un document de trois articles, déjà enregistré. */
  async function seeded(): Promise<FakeContentRepository> {
    const repository = new FakeContentRepository();
    const handler = new AddSalesTermsParagraphHandler(repository, new FixedIdGenerator("art"));
    for (const word of ["objet", "commandes", "litiges"]) {
      await handler.execute(new AddSalesTermsParagraphCommand(prose(word), "staff_42"));
    }
    return repository;
  }

  it("réécrit un article sans changer son identifiant", async () => {
    const repository = await seeded();
    await new EditSalesTermsParagraphHandler(repository).execute(
      new EditSalesTermsParagraphCommand("art_000002", prose("commandes-v2"), "staff_7"),
    );

    expect(repository.content.paragraphs[1]).toMatchObject({
      id: "art_000002",
      fr: { title: "commandes-v2" },
    });
    expect(repository.lastAuthor).toBe("staff_7");
  });

  it("laisse remonter le 404 du domaine sur un article inconnu", async () => {
    const repository = await seeded();

    await expect(
      new RemoveSalesTermsParagraphHandler(repository).execute(
        new RemoveSalesTermsParagraphCommand("inconnu", "staff_42"),
      ),
    ).rejects.toBeInstanceOf(UnknownSalesTermsParagraphError);
  });

  it("n'enregistre RIEN quand le domaine refuse", async () => {
    const repository = await seeded();
    const savesBefore = repository.saves;

    await expect(
      new MoveSalesTermsParagraphHandler(repository).execute(
        new MoveSalesTermsParagraphCommand("art_000001", 3, "staff_42"),
      ),
    ).rejects.toBeInstanceOf(SalesTermsPositionOutOfRangeError);

    // Le refus vient AVANT le `save` : un rang hors bornes ne doit pas faire
    // monter la révision d'un document inchangé.
    expect(repository.saves).toBe(savesBefore);
  });

  it("déplace, puis retire, et l'ordre suit", async () => {
    const repository = await seeded();
    await new MoveSalesTermsParagraphHandler(repository).execute(
      new MoveSalesTermsParagraphCommand("art_000003", 0, "staff_42"),
    );
    await new RemoveSalesTermsParagraphHandler(repository).execute(
      new RemoveSalesTermsParagraphCommand("art_000001", "staff_42"),
    );

    expect(ids(repository)).toEqual(["art_000003", "art_000002"]);
  });
});
