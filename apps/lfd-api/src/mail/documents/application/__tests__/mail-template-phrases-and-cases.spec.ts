import { startingMailDocument, type MailTemplateDeclaration } from "@lfd/mail-blocks";
import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { SaveMailCopyDraftCommand } from "../../../copy/application/commands/save-mail-copy-draft.command.js";
import { SaveMailCopyDraftHandler } from "../../../copy/application/commands/save-mail-copy-draft.handler.js";
import { SendMailCopyTrialCommand } from "../../../copy/application/commands/send-mail-copy-trial.command.js";
import {
  InMemoryAdminReader,
  InMemoryMailCopy,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import { MANIFEST, SUBJECT } from "../../../copy/domain/__tests__/mail-copy-fixtures.js";
import {
  UnknownMailCaseError,
  UnknownMailTemplateError,
} from "../../domain/mail-document-errors.js";
import { SendMailDocumentTrialCommand } from "../commands/send-mail-document-trial.command.js";
import { SendMailDocumentTrialHandler } from "../commands/send-mail-document-trial.handler.js";
import { GetMailTemplatePhrasesHandler } from "../queries/get-mail-template-phrases.handler.js";
import { GetMailTemplatePhrasesQuery } from "../queries/get-mail-template-phrases.query.js";
import { PreviewMailDocumentHandler } from "../queries/preview-mail-document.handler.js";
import { PreviewMailDocumentQuery } from "../queries/preview-mail-document.query.js";
import {
  FixedCatalogue,
  InMemoryMailDocumentReader,
  InMemoryMailDocuments,
  RecordingDocumentRenderer,
  entryOf,
} from "./mail-document-doubles.js";

/** Lot S4d : les phrases d'un e-mail sous `mail_templates`, et le cas que l'aperçu rend. */

const TEMPLATE = SUBJECT.mail;
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "image", "footer"],
  locales: ["fr", "en", "it"],
  charter: "lfc",
  nature: "transactional",
};
const CASES = [
  { id: "specimen", label: "Exemple" },
  { id: "due-delivery", label: "Livraison, à régler" },
];

function world() {
  const texts = new InMemoryMailCopy();
  const copy = new InMemoryAdminReader(texts);
  const catalogue = new FixedCatalogue([{ ...entryOf(TEMPLATE, DECLARATION), cases: CASES }]);
  const renderer = new RecordingDocumentRenderer();
  const reader = new InMemoryMailDocumentReader(new InMemoryMailDocuments());
  return {
    renderer,
    write: new SaveMailCopyDraftHandler(
      texts,
      MANIFEST,
      new FixedClock(new Date(0)),
      new DirectUnitOfWork(),
    ),
    phrases: new GetMailTemplatePhrasesHandler(catalogue, copy, MANIFEST),
    preview: new PreviewMailDocumentHandler(catalogue, reader, copy, MANIFEST, renderer),
  };
}

describe("les phrases d'un e-mail, sous le droit de l'éditeur", () => {
  it("relit la phrase écrite par la commande de l'écran des textes, en brouillon", async () => {
    const w = world();
    await w.write.execute(
      new SaveMailCopyDraftCommand(
        TEMPLATE,
        "subject",
        "fr",
        "Commande {ref} bien reçue",
        0,
        "fiche-colette",
      ),
    );
    const view = await w.phrases.execute(new GetMailTemplatePhrasesQuery(TEMPLATE));
    expect(view.template).toBe(TEMPLATE);
    expect(view.phrases.find((phrase) => phrase.path === "subject")?.locales.fr).toMatchObject({
      draftState: "set",
      draftText: "Commande {ref} bien reçue",
      revision: 1,
    });
  });

  it("refuse un e-mail hors du registre", async () => {
    await expect(
      world().phrases.execute(new GetMailTemplatePhrasesQuery("customer.inconnu")),
    ).rejects.toBeInstanceOf(UnknownMailTemplateError);
  });
});

describe("le cas que l'aperçu rend", () => {
  it("passe le cas demandé, et l'exemple de l'e-mail faute d'autre", async () => {
    const w = world();
    await w.preview.execute(
      new PreviewMailDocumentQuery(TEMPLATE, "fr", "draft", null, "due-delivery"),
    );
    await w.preview.execute(new PreviewMailDocumentQuery(TEMPLATE, "fr", "draft", null));
    expect(w.renderer.calls.map((call) => call.caseId)).toEqual(["due-delivery", "specimen"]);
  });

  it("refuse un cas que l'e-mail n'a pas, sans rien rendre", async () => {
    const w = world();
    await expect(
      w.preview.execute(new PreviewMailDocumentQuery(TEMPLATE, "fr", "draft", null, "inconnu")),
    ).rejects.toBeInstanceOf(UnknownMailCaseError);
    expect(w.renderer.calls).toHaveLength(0);
  });
});

describe("« M'envoyer un essai » depuis l'éditeur", () => {
  async function subject() {
    const sent: unknown[] = [];
    const copy = new InMemoryAdminReader(new InMemoryMailCopy());
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: SendMailDocumentTrialHandler,
          useFactory: (bus: CommandBus) =>
            new SendMailDocumentTrialHandler(
              new FixedCatalogue([{ ...entryOf(TEMPLATE, DECLARATION), cases: CASES }]),
              new InMemoryMailDocumentReader(new InMemoryMailDocuments()),
              copy,
              MANIFEST,
              bus,
            ),
          inject: [CommandBus],
        },
        {
          provide: CommandBus,
          useValue: {
            execute: (command: unknown) => {
              sent.push(command);
              return Promise.resolve();
            },
          },
        },
      ],
    }).compile();
    return { sent, handler: module.get(SendMailDocumentTrialHandler) };
  }

  it("passe par la commande d'essai des textes, brouillons, cas et document de départ", async () => {
    const { sent, handler } = await subject();
    await handler.execute(
      new SendMailDocumentTrialCommand(TEMPLATE, "en", "due-delivery", "fiche-colette", "cle-1"),
    );
    expect(sent).toEqual([
      new SendMailCopyTrialCommand(TEMPLATE, "en", "draft", "fiche-colette", "cle-1", {
        caseId: "due-delivery",
        document: startingMailDocument(TEMPLATE, DECLARATION),
      }),
    ]);
  });

  /** S5e (§ 21) : l'essai sur les phrases publiées, par la même commande. */
  it("passe la source demandée — les phrases publiées — à la commande d'essai des textes", async () => {
    const { sent, handler } = await subject();
    await handler.execute(
      new SendMailDocumentTrialCommand(
        TEMPLATE,
        "fr",
        "specimen",
        "fiche-colette",
        "cle-3",
        "published",
      ),
    );
    expect(sent).toEqual([
      new SendMailCopyTrialCommand(TEMPLATE, "fr", "published", "fiche-colette", "cle-3", {
        caseId: "specimen",
        document: startingMailDocument(TEMPLATE, DECLARATION),
      }),
    ]);
  });

  it("refuse un cas inconnu sans rien envoyer", async () => {
    const { sent, handler } = await subject();
    await expect(
      handler.execute(
        new SendMailDocumentTrialCommand(TEMPLATE, "fr", "inconnu", "fiche-colette", "cle-2"),
      ),
    ).rejects.toBeInstanceOf(UnknownMailCaseError);
    expect(sent).toEqual([]);
  });
});
