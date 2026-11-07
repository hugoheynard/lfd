import { MailSpaceCharter } from "../../domain/mail-space-charter.js";
import {
  MailCharterRefusedError,
  MailTemplateOutsideSpaceError,
  UnknownMailSpaceError,
} from "../../domain/mail-charter-errors.js";
import { GetMailCharterHistoryHandler } from "../queries/get-mail-charter-history.handler.js";
import { GetMailCharterHistoryQuery } from "../queries/get-mail-charter-history.query.js";
import { GetMailCharterHandler } from "../queries/get-mail-charter.handler.js";
import { GetMailCharterQuery } from "../queries/get-mail-charter.query.js";
import { PreviewMailCharterHandler } from "../queries/preview-mail-charter.handler.js";
import { PreviewMailCharterQuery } from "../queries/preview-mail-charter.query.js";
import {
  FixedSpaceDirectory,
  InMemoryMailCharterReader,
  InMemoryMailCharters,
  LFD_SETTINGS,
  RecordingCharterPreview,
  STARTING_SETTINGS,
} from "./mail-charter-doubles.js";

const STAMP = { at: new Date(0), staffId: "fiche-colette" };

function world() {
  const charters = new InMemoryMailCharters();
  const reader = new InMemoryMailCharterReader(charters);
  const directory = new FixedSpaceDirectory();
  const renderer = new RecordingCharterPreview();
  return {
    charters,
    renderer,
    read: (space: string) =>
      new GetMailCharterHandler(reader, directory).execute(new GetMailCharterQuery(space)),
    history: (space: string) =>
      new GetMailCharterHistoryHandler(reader).execute(new GetMailCharterHistoryQuery(space)),
    preview: (query: PreviewMailCharterQuery) =>
      new PreviewMailCharterHandler(reader, directory, renderer).execute(query),
  };
}

async function publishedOnce(charters: InMemoryMailCharters): Promise<void> {
  const charter = MailSpaceCharter.untouched("lfd");
  charter.saveDraft(STARTING_SETTINGS, 0, STAMP);
  charter.publish(["fr"], 1, STAMP, null);
  await charters.save(charter);
}

describe("lire la charte d'un espace", () => {
  it("rend la charte de départ, les e-mails et les langues de l'espace, sans rien écrire", async () => {
    const w = world();
    const view = await w.read("lfd");
    expect(view).toEqual({
      space: "lfd",
      templates: ["staff.invited", "staff.account-alert"],
      locales: ["fr"],
      settings: STARTING_SETTINGS,
      source: "starting",
      starting: STARTING_SETTINGS,
      revision: 0,
      published: null,
      draft: null,
    });
    expect(w.charters.rows.size).toBe(0);
  });

  it("rend la publiée, avec sa version et son auteur", async () => {
    const w = world();
    await publishedOnce(w.charters);
    const view = await w.read("lfd");
    expect(view.source).toBe("published");
    expect(view.published).toEqual({
      version: 1,
      settings: STARTING_SETTINGS,
      at: new Date(0).toISOString(),
      staffId: "fiche-colette",
    });
  });

  it("refuse un espace inconnu", async () => {
    await expect(world().read("internal")).rejects.toBeInstanceOf(UnknownMailSpaceError);
  });
});

describe("l'historique", () => {
  it("rend les versions publiées, et marque celle qui sert", async () => {
    const w = world();
    await publishedOnce(w.charters);
    const history = await w.history("lfd");
    expect(history.versions).toEqual([
      expect.objectContaining({ version: 1, current: true, settings: STARTING_SETTINGS }),
    ]);
    expect((await w.history("lfc")).versions).toEqual([]);
  });
});

describe("l'aperçu de la charte", () => {
  it("rend le premier e-mail de l'espace avec les réglages de l'écran", async () => {
    const w = world();
    const view = await w.preview(new PreviewMailCharterQuery("lfd", null, "fr", LFD_SETTINGS));
    expect(view).toEqual({
      space: "lfd",
      template: "staff.invited",
      locale: "fr",
      subject: "staff.invited",
      html: "<p>#7a1f3d</p>",
    });
  });

  it("sans réglages, la charte que l'écran ouvrirait", async () => {
    const w = world();
    await w.preview(new PreviewMailCharterQuery("lfd", "staff.account-alert", "fr", null));
    expect(w.renderer.calls[0]?.settings).toEqual(STARTING_SETTINGS);
  });

  it("refuse un e-mail d'un autre espace", async () => {
    await expect(
      world().preview(new PreviewMailCharterQuery("lfd", "customer.order-placed", "fr", null)),
    ).rejects.toBeInstanceOf(MailTemplateOutsideSpaceError);
  });

  it("refuse des réglages de forme invalide, mais pas un contraste faible", async () => {
    const w = world();
    const bad = { ...LFD_SETTINGS, colors: { ...LFD_SETTINGS.colors, page: "beige" } };
    await expect(
      w.preview(new PreviewMailCharterQuery("lfd", null, "fr", bad)),
    ).rejects.toBeInstanceOf(MailCharterRefusedError);
    const pale = { ...LFD_SETTINGS, colors: { ...LFD_SETTINGS.colors, mutedText: "#eeeeee" } };
    await expect(
      w.preview(new PreviewMailCharterQuery("lfd", null, "fr", pale)),
    ).resolves.toMatchObject({ template: "staff.invited" });
  });
});
