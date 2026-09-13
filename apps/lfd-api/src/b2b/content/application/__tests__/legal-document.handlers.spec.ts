import {
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_LEGAL_DOCUMENT,
  type FooterContent,
  type FooterContentView,
  type LegalDocument as LegalDocumentContent,
  type LegalDocumentParagraphPayload,
  type LegalDocumentView,
  type LegalMention,
} from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { LegalDocument } from "../../domain/entities/legal-document.js";
import {
  LegalDocumentPositionOutOfRangeError,
  UnknownLegalDocumentParagraphError,
} from "../../domain/errors/legal-document-errors.js";
import { PlatformContentRepository } from "../../domain/platform-content.repository.js";
import { AddLegalDocumentParagraphCommand } from "../add-legal-document-paragraph.command.js";
import { AddLegalDocumentParagraphHandler } from "../add-legal-document-paragraph.handler.js";
import { EditLegalDocumentParagraphCommand } from "../edit-legal-document-paragraph.command.js";
import { EditLegalDocumentParagraphHandler } from "../edit-legal-document-paragraph.handler.js";
import { GetLegalDocumentHandler } from "../get-legal-document.handler.js";
import { GetLegalDocumentQuery } from "../get-legal-document.query.js";
import { MoveLegalDocumentParagraphCommand } from "../move-legal-document-paragraph.command.js";
import { MoveLegalDocumentParagraphHandler } from "../move-legal-document-paragraph.handler.js";
import { RemoveLegalDocumentParagraphCommand } from "../remove-legal-document-paragraph.command.js";
import { RemoveLegalDocumentParagraphHandler } from "../remove-legal-document-paragraph.handler.js";
import { SetLegalDocumentTitleCommand } from "../set-legal-document-title.command.js";
import { SetLegalDocumentTitleHandler } from "../set-legal-document-title.handler.js";

/** La mention par défaut des cas qui n'en éprouvent qu'une seule. */
const SALES_TERMS: LegalMention = "salesTerms";

/** Un article reconnaissable à son mot-clé, dans les trois langues. */
function prose(word: string): LegalDocumentParagraphPayload {
  return {
    fr: { title: word, body: `Corps ${word}` },
    en: { title: word, body: `Body ${word}` },
    it: { title: word, body: `Corpo ${word}` },
  };
}

/**
 * Un double du port — une classe qui étend l'abstraite, pas un module moqué.
 *
 * Il tient l'état **par mention**, chacune sous la forme d'un document du
 * contrat, exactement comme l'adaptateur tient une ligne par clé : c'est ce qui
 * fait que `load → save` s'y comporte comme en base, révision comprise, et que
 * deux mentions ne peuvent pas se marcher dessus par accident du double.
 */
class FakeContentRepository extends PlatformContentRepository {
  private readonly stored = new Map<LegalMention, LegalDocumentContent>();
  private readonly counts = new Map<LegalMention, number>();
  saves = 0;
  lastAuthor: string | null = null;

  content(mention: LegalMention = SALES_TERMS): LegalDocumentContent {
    return this.stored.get(mention) ?? DEFAULT_LEGAL_DOCUMENT(mention);
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

  readLegalDocument(mention: LegalMention): Promise<LegalDocumentView> {
    return Promise.resolve({
      // Le repli d'AFFICHAGE : jamais `null`, jamais sans titre.
      content: this.content(mention),
      revision: this.counts.get(mention) ?? 0,
      updatedAt: new Date(0).toISOString(),
      updatedBy: this.lastAuthor,
    });
  }

  loadLegalDocument(mention: LegalMention): Promise<LegalDocument> {
    return Promise.resolve(LegalDocument.reconstitute(this.content(mention)));
  }

  saveLegalDocument(
    mention: LegalMention,
    document: LegalDocument,
    staffUserId: string,
  ): Promise<void> {
    this.stored.set(mention, document.snapshot());
    this.counts.set(mention, (this.counts.get(mention) ?? 0) + 1);
    this.saves += 1;
    this.lastAuthor = staffUserId;
    return Promise.resolve();
  }
}

const ids = (repository: FakeContentRepository, mention: LegalMention = SALES_TERMS): string[] =>
  repository.content(mention).paragraphs.map((paragraph) => paragraph.id);

describe("lire un document légal", () => {
  it("aboutit toujours — il n'y a pas de cas « pas de document » à traiter", async () => {
    const view = await new GetLegalDocumentHandler(new FakeContentRepository()).execute(
      new GetLegalDocumentQuery(SALES_TERMS),
    );

    // Aboutir n'est pas rendre quelque chose à lire : le document de départ
    // porte un TITRE, et aucun article. Les deux surfaces savent dire « pas
    // encore publié » ; aucune n'a à traiter une absence de réponse.
    expect(view.revision).toBe(0);
    expect(view.content.title.fr).not.toBe("");
    expect(view.content.paragraphs).toEqual([]);
  });

  it("sert le titre de la mention DEMANDÉE, et pas celui d'une autre", async () => {
    const handler = new GetLegalDocumentHandler(new FakeContentRepository());

    const cookies = await handler.execute(new GetLegalDocumentQuery("cookies"));
    const privacy = await handler.execute(new GetLegalDocumentQuery("privacy"));

    expect(cookies.content.title.fr).not.toBe(privacy.content.title.fr);
  });
});

describe("renommer le document", () => {
  it("enregistre le nouveau titre et transmet QUI écrit", async () => {
    const repository = new FakeContentRepository();
    await new SetLegalDocumentTitleHandler(repository).execute(
      new SetLegalDocumentTitleCommand(
        SALES_TERMS,
        { fr: "CGV", en: "T&C", it: "CGV it" },
        "staff_42",
      ),
    );

    expect(repository.content().title.fr).toBe("CGV");
    expect(repository.lastAuthor).toBe("staff_42");
  });
});

describe("ajouter un article", () => {
  it("rend l'identifiant frappé par le port, et rien d'autre", async () => {
    const repository = new FakeContentRepository();
    const handler = new AddLegalDocumentParagraphHandler(repository, new FixedIdGenerator("art"));

    const id = await handler.execute(
      new AddLegalDocumentParagraphCommand(SALES_TERMS, prose("objet"), "staff_42"),
    );

    // L'écran a besoin de désigner ce qu'il vient d'ajouter ; le document, lui,
    // se relit — une commande ne rend pas de modèle de lecture.
    expect(id).toBe("art_000001");
    expect(ids(repository)).toEqual(["art_000001"]);
  });

  it("prend un identifiant NEUF à chaque ajout, jamais dérivé du titre", async () => {
    const repository = new FakeContentRepository();
    const handler = new AddLegalDocumentParagraphHandler(repository, new FixedIdGenerator("art"));

    await handler.execute(
      new AddLegalDocumentParagraphCommand(SALES_TERMS, prose("objet"), "staff_42"),
    );
    await handler.execute(
      new AddLegalDocumentParagraphCommand(SALES_TERMS, prose("objet"), "staff_42"),
    );

    // Deux articles homonymes : c'est exactement le cas qu'un identifiant
    // dérivé du titre écraserait.
    expect(ids(repository)).toEqual(["art_000001", "art_000002"]);
  });

  it("ajoute AU DOCUMENT ENREGISTRÉ, pas au repli d'affichage", async () => {
    const repository = new FakeContentRepository();
    const handler = new AddLegalDocumentParagraphHandler(repository, new FixedIdGenerator("art"));

    await handler.execute(
      new AddLegalDocumentParagraphCommand(SALES_TERMS, prose("objet"), "staff_42"),
    );

    // Le repli de lecture ne porte aucun article ; en charger un à l'écriture
    // les ferait persister sous des identifiants que le produit ne frappe pas.
    expect(ids(repository)).toEqual(["art_000001"]);
  });
});

describe("modifier, retirer, déplacer", () => {
  /** Un document de trois articles, déjà enregistré sous la mention demandée. */
  async function seeded(
    mention: LegalMention = SALES_TERMS,
    repository = new FakeContentRepository(),
  ): Promise<FakeContentRepository> {
    const handler = new AddLegalDocumentParagraphHandler(repository, new FixedIdGenerator("art"));
    for (const word of ["objet", "commandes", "litiges"]) {
      await handler.execute(new AddLegalDocumentParagraphCommand(mention, prose(word), "staff_42"));
    }
    return repository;
  }

  it("réécrit un article sans changer son identifiant", async () => {
    const repository = await seeded();
    await new EditLegalDocumentParagraphHandler(repository).execute(
      new EditLegalDocumentParagraphCommand(
        SALES_TERMS,
        "art_000002",
        prose("commandes-v2"),
        "staff_7",
      ),
    );

    expect(repository.content().paragraphs[1]).toMatchObject({
      id: "art_000002",
      fr: { title: "commandes-v2" },
    });
    expect(repository.lastAuthor).toBe("staff_7");
  });

  it("laisse remonter le 404 du domaine sur un article inconnu", async () => {
    const repository = await seeded();

    await expect(
      new RemoveLegalDocumentParagraphHandler(repository).execute(
        new RemoveLegalDocumentParagraphCommand(SALES_TERMS, "inconnu", "staff_42"),
      ),
    ).rejects.toBeInstanceOf(UnknownLegalDocumentParagraphError);
  });

  it("n'enregistre RIEN quand le domaine refuse", async () => {
    const repository = await seeded();
    const savesBefore = repository.saves;

    await expect(
      new MoveLegalDocumentParagraphHandler(repository).execute(
        new MoveLegalDocumentParagraphCommand(SALES_TERMS, "art_000001", 3, "staff_42"),
      ),
    ).rejects.toBeInstanceOf(LegalDocumentPositionOutOfRangeError);

    // Le refus vient AVANT le `save` : un rang hors bornes ne doit pas faire
    // monter la révision d'un document inchangé.
    expect(repository.saves).toBe(savesBefore);
  });

  it("déplace, puis retire, et l'ordre suit", async () => {
    const repository = await seeded();
    await new MoveLegalDocumentParagraphHandler(repository).execute(
      new MoveLegalDocumentParagraphCommand(SALES_TERMS, "art_000003", 0, "staff_42"),
    );
    await new RemoveLegalDocumentParagraphHandler(repository).execute(
      new RemoveLegalDocumentParagraphCommand(SALES_TERMS, "art_000001", "staff_42"),
    );

    expect(ids(repository)).toEqual(["art_000003", "art_000002"]);
  });

  /**
   * 🔴 L'invariant de la généralisation : cinq mentions, cinq lignes, et une
   * commande qui en vise une n'en touche aucune autre. C'est ce qu'une clé
   * dérivée d'un nom d'identifiant, ou oubliée en chemin, ferait sauter en
   * silence — le document écrit resterait lisible, mais sous la mauvaise
   * mention.
   */
  it("écrire dans une mention ne touche pas les autres", async () => {
    const repository = await seeded("cookies");
    await seeded("privacy", repository);

    await new RemoveLegalDocumentParagraphHandler(repository).execute(
      new RemoveLegalDocumentParagraphCommand("cookies", "art_000001", "staff_42"),
    );
    await new SetLegalDocumentTitleHandler(repository).execute(
      new SetLegalDocumentTitleCommand(
        "cookies",
        { fr: "Traceurs", en: "Trackers", it: "Traccianti" },
        "staff_42",
      ),
    );

    // Les deux mentions portent les MÊMES identifiants d'article — chaque
    // document a sa propre suite, et c'est le cas le plus dur : retirer
    // `art_000001` des cookies ne doit pas retirer celui de la confidentialité.
    expect(ids(repository, "cookies")).toEqual(["art_000002", "art_000003"]);
    expect(ids(repository, "privacy")).toEqual(["art_000001", "art_000002", "art_000003"]);
    expect(repository.content("privacy").title.fr).toBe(DEFAULT_LEGAL_DOCUMENT("privacy").title.fr);
  });
});
