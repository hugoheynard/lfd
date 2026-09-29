import { DEFAULT_LEGAL_DOCUMENT, type LegalMention } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  LegalDocumentChangedError,
  LegalDocumentPositionOutOfRangeError,
  UnknownLegalDocumentParagraphError,
} from "../../domain/errors/legal-document-errors.js";
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
import { FakeContentRepository, SALES_TERMS, ids, prose } from "./fake-content.repository.js";

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
        repository.revision(SALES_TERMS),
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
      new AddLegalDocumentParagraphCommand(
        SALES_TERMS,
        prose("objet"),
        repository.revision(SALES_TERMS),
        "staff_42",
      ),
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
      new AddLegalDocumentParagraphCommand(
        SALES_TERMS,
        prose("objet"),
        repository.revision(SALES_TERMS),
        "staff_42",
      ),
    );
    await handler.execute(
      new AddLegalDocumentParagraphCommand(
        SALES_TERMS,
        prose("objet"),
        repository.revision(SALES_TERMS),
        "staff_42",
      ),
    );

    // Deux articles homonymes : c'est exactement le cas qu'un identifiant
    // dérivé du titre écraserait.
    expect(ids(repository)).toEqual(["art_000001", "art_000002"]);
  });

  it("ajoute AU DOCUMENT ENREGISTRÉ, pas au repli d'affichage", async () => {
    const repository = new FakeContentRepository();
    const handler = new AddLegalDocumentParagraphHandler(repository, new FixedIdGenerator("art"));

    await handler.execute(
      new AddLegalDocumentParagraphCommand(
        SALES_TERMS,
        prose("objet"),
        repository.revision(SALES_TERMS),
        "staff_42",
      ),
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
      await handler.execute(
        new AddLegalDocumentParagraphCommand(
          mention,
          prose(word),
          repository.revision(mention),
          "staff_42",
        ),
      );
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
        repository.revision(SALES_TERMS),
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
        new RemoveLegalDocumentParagraphCommand(
          SALES_TERMS,
          "inconnu",
          repository.revision(SALES_TERMS),
          "staff_42",
        ),
      ),
    ).rejects.toBeInstanceOf(UnknownLegalDocumentParagraphError);
  });

  it("n'enregistre RIEN quand le domaine refuse", async () => {
    const repository = await seeded();
    const savesBefore = repository.saves;

    await expect(
      new MoveLegalDocumentParagraphHandler(repository).execute(
        new MoveLegalDocumentParagraphCommand(
          SALES_TERMS,
          "art_000001",
          3,
          repository.revision(SALES_TERMS),
          "staff_42",
        ),
      ),
    ).rejects.toBeInstanceOf(LegalDocumentPositionOutOfRangeError);

    // Le refus vient AVANT le `save` : un rang hors bornes ne doit pas faire
    // monter la révision d'un document inchangé.
    expect(repository.saves).toBe(savesBefore);
  });

  it("déplace, puis retire, et l'ordre suit", async () => {
    const repository = await seeded();
    await new MoveLegalDocumentParagraphHandler(repository).execute(
      new MoveLegalDocumentParagraphCommand(
        SALES_TERMS,
        "art_000003",
        0,
        repository.revision(SALES_TERMS),
        "staff_42",
      ),
    );
    await new RemoveLegalDocumentParagraphHandler(repository).execute(
      new RemoveLegalDocumentParagraphCommand(
        SALES_TERMS,
        "art_000001",
        repository.revision(SALES_TERMS),
        "staff_42",
      ),
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
      new RemoveLegalDocumentParagraphCommand(
        "cookies",
        "art_000001",
        repository.revision("cookies"),
        "staff_42",
      ),
    );
    await new SetLegalDocumentTitleHandler(repository).execute(
      new SetLegalDocumentTitleCommand(
        "cookies",
        { fr: "Traceurs", en: "Trackers", it: "Traccianti" },
        repository.revision("cookies"),
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

describe("la révision lue (plan confidentialité §4.5, B2)", () => {
  /**
   * Régression : un écran ouvert AVANT le geste d'un collègue réécrivait le
   * document entier sans ce geste — une section requise créée entre-temps
   * disparaissait en silence.
   */
  it("refuse une écriture sur une révision périmée, et n'enregistre rien", async () => {
    const repository = new FakeContentRepository();
    const add = new AddLegalDocumentParagraphHandler(repository, new FixedIdGenerator("art"));
    const staleRevision = repository.revision();
    await add.execute(
      new AddLegalDocumentParagraphCommand(SALES_TERMS, prose("objet"), staleRevision, "staff_1"),
    );
    const savesBefore = repository.saves;

    await expect(
      new RemoveLegalDocumentParagraphHandler(repository).execute(
        new RemoveLegalDocumentParagraphCommand(
          SALES_TERMS,
          "art_000001",
          staleRevision,
          "staff_2",
        ),
      ),
    ).rejects.toBeInstanceOf(LegalDocumentChangedError);
    expect(repository.saves).toBe(savesBefore);
    expect(ids(repository)).toEqual(["art_000001"]);
  });
});
