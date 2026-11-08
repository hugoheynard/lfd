/**
 * E2E des **chartes des espaces d'e-mails** (plan
 * `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 25, lot
 * C1) : ouvrir n'écrit rien, le brouillon à révision, la publication qui
 * refuse un contraste trop faible, copie le logo et vaut au prochain envoi
 * pour les e-mails de l'espace — internes compris —, l'historique, l'aperçu.
 *
 * Les deux frontières sortantes de la copie d'image sont doublées — le
 * téléchargement et le stockage R2 — et l'admission posée, comme dans
 * `mail-templates.e2e-spec.ts` ; le reste est le vrai chemin.
 */
import type {
  MailCharterHistoryView,
  MailCharterPreviewView,
  MailCharterPublicationView,
  MailCharterSettings,
  MailCharterView,
  MailDocumentBlockPreviewView,
  MailDocumentPreviewView,
  MailEditorView,
} from "@lfd/mail-blocks";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { b2bMailTemplates } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import { specimenDataOf } from "../src/mail/templates/specimens/mail-specimens.js";
import {
  MAIL_IMAGE_ADMISSION,
  type MailImageAdmission,
} from "../src/mail/images/application/mail-image-admission.js";
import {
  type DownloadLimits,
  MailImageDownloader,
} from "../src/mail/images/domain/ports/mail-image.downloader.js";
import {
  type MailImageCopy,
  MailImageStore,
} from "../src/mail/images/domain/ports/mail-image.store.js";
import { jsonBody } from "./e2e-harness.js";
import { mailCopyScene } from "./mail-copy-scene.js";

const MEDIA_ORIGIN = "https://media.lfc.test";
/** Les copies du bloc : le dossier `mail/` du bucket des médias. */
const MAIL_IMAGES = `${MEDIA_ORIGIN}/mail`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 4, 5, 6]);

/** Le téléchargement doublé : des octets PNG, et la liste des adresses demandées. */
class PngDownloader extends MailImageDownloader {
  readonly urls: string[] = [];

  download(url: URL, _limits: DownloadLimits): Promise<Buffer> {
    this.urls.push(url.href);
    return Promise.resolve(PNG);
  }
}

/** Le stockage doublé, adressé par le contenu comme R2. */
class MemoryMailImages extends MailImageStore {
  put(bytes: Buffer, _contentType: string): Promise<MailImageCopy> {
    return Promise.resolve({ url: `${MAIL_IMAGES}/templates/${bytes.toString("hex")}.png` });
  }
}

const downloader = new PngDownloader();
const admission: MailImageAdmission = {
  origins: [MEDIA_ORIGIN],
  copiesBaseUrl: MAIL_IMAGES,
};
const scene = mailCopyScene([
  { token: MailImageDownloader, value: downloader },
  { token: MailImageStore, value: new MemoryMailImages() },
  { token: MAIL_IMAGE_ADMISSION, value: admission },
]);
const { staff, ctx, transport } = scene;

const CHARTERS = "/admin/mail-charters";
const LOGO = `${MEDIA_ORIGIN}/brand/logo-lfd.png`;
const LOGO_COPY = `${MAIL_IMAGES}/templates/${PNG.toString("hex")}.png`;
const PRIMARY = "#7a1f3d";
const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

async function open(space = "lfd"): Promise<MailCharterView> {
  return jsonBody<MailCharterView>(await staff().get(`${CHARTERS}/${space}`).expect(200));
}

function lfdCharter(starting: MailCharterSettings): MailCharterSettings {
  return {
    ...starting,
    logo: { src: LOGO, alt: { fr: "La Folie Douce" } },
    colors: { ...starting.colors, primary: PRIMARY },
    footer: { fr: "La Folie Douce — équipe" },
  };
}

async function draftAndPublish(settings: MailCharterSettings): Promise<MailCharterPublicationView> {
  await staff().put(`${CHARTERS}/lfd/draft`).send({ settings, expectedRevision: 0 }).expect(204);
  return jsonBody<MailCharterPublicationView>(
    await staff().post(`${CHARTERS}/lfd/publications`).send({ expectedRevision: 1 }).expect(201),
  );
}

/** Un vrai envoi par le mailer de l'application : charte en service comprise. */
async function send<K extends keyof B2bMails>(template: K): Promise<string> {
  await ctx()
    .app.get<B2bMailer>(MAILER)
    .send({ to: "equipe@exemple.invalid", template, data: specimenDataOf(template, "fr") });
  return transport.sent.at(-1)?.html ?? "";
}

function codeRendering<K extends keyof B2bMails>(template: K): string {
  return REGISTRY[template](specimenDataOf(template, "fr")).html;
}

describe("ouvrir la charte d'un espace", () => {
  it("rend la charte de départ et les e-mails de l'espace, internes compris, sans rien écrire", async () => {
    const view = await open();
    expect(view).toMatchObject({ space: "lfd", source: "starting", revision: 0, published: null });
    expect(view.templates).toEqual(
      expect.arrayContaining(["staff.invited", "staff.account-alert"]),
    );
    // La sonde de déploiement part sous cette charte, mais n'est pas à l'éditeur (2026-11-07).
    expect(view.templates).not.toContain("ops.deploy-check");
    expect(view.templates).not.toContain("customer.order-placed");
    expect(view.settings).toEqual(view.starting);
    expect((await open()).revision).toBe(0);
  });

  it("refuse un espace qui n'existe pas (404), `internal` compris", async () => {
    await staff().get(`${CHARTERS}/internal`).expect(404);
  });
});

describe("enregistrer et publier", () => {
  it("refuse une couleur mal formée (400) et une révision dépassée (409)", async () => {
    const { starting } = await open();
    const bad = { ...starting, colors: { ...starting.colors, text: "noir" } };
    await staff()
      .put(`${CHARTERS}/lfd/draft`)
      .send({ settings: bad, expectedRevision: 0 })
      .expect(400);
    await staff()
      .put(`${CHARTERS}/lfd/draft`)
      .send({ settings: starting, expectedRevision: 0 })
      .expect(204);
    await staff()
      .put(`${CHARTERS}/lfd/draft`)
      .send({ settings: starting, expectedRevision: 0 })
      .expect(409);
  });

  /** RGAA 3.2 : un texte secondaire trop pâle se refuse à la publication, et rien ne part. */
  it("refuse de publier un contraste sous 4,5:1, en le nommant", async () => {
    const { starting } = await open();
    const pale = { ...starting, colors: { ...starting.colors, mutedText: "#bbbbbb" } };
    await staff()
      .put(`${CHARTERS}/lfd/draft`)
      .send({ settings: pale, expectedRevision: 0 })
      .expect(204);
    const refusal = await staff()
      .post(`${CHARTERS}/lfd/publications`)
      .send({ expectedRevision: 1 })
      .expect(400);
    expect(JSON.stringify(refusal.body)).toContain("4,5:1");
    expect((await open()).published).toBeNull();
  });

  it("publie, copie le logo, et garde la version dans l'historique", async () => {
    const { starting } = await open();
    downloader.urls.length = 0;
    const publication = await draftAndPublish(lfdCharter(starting));

    expect(publication.version).toBe(1);
    expect(downloader.urls).toEqual([LOGO]);
    const view = await open();
    expect(view.source).toBe("published");
    expect(view.published?.settings.logo?.src).toBe(LOGO_COPY);
    const history = jsonBody<MailCharterHistoryView>(
      await staff().get(`${CHARTERS}/lfd/history`).expect(200),
    );
    expect(history.versions).toEqual([expect.objectContaining({ version: 1, current: true })]);
  });
});

describe("l'envoi suit la charte publiée de l'espace", () => {
  it("avant toute publication, un e-mail interne part tel qu'aujourd'hui, à l'octet", async () => {
    expect(await send("staff.account-alert")).toBe(codeRendering("staff.account-alert"));
  });

  it("après la publication de la charte La Folie Douce, les e-mails internes la prennent", async () => {
    const { starting } = await open();
    await draftAndPublish(lfdCharter(starting));

    const html = await send("staff.account-alert");
    expect(html).toContain(`background:${PRIMARY};`);
    expect(html).toContain(`src="${LOGO_COPY}"`);
    expect(html).toContain("La Folie Douce — équipe");
  });

  it("la charte La Folie Douce ne touche pas les e-mails des clients", async () => {
    const { starting } = await open();
    await draftAndPublish(lfdCharter(starting));
    expect(await send("customer.password-reset")).toBe(codeRendering("customer.password-reset"));
  });
});

describe("l'aperçu de la charte", () => {
  it("rend un e-mail de l'espace avec les réglages de l'écran, sans rien écrire", async () => {
    const { starting } = await open();
    const preview = jsonBody<MailCharterPreviewView>(
      await staff()
        .post(`${CHARTERS}/lfd/previews`)
        .send({ template: "staff.invited", locale: "fr", settings: lfdCharter(starting) })
        .expect(200),
    );
    expect(preview).toMatchObject({ space: "lfd", template: "staff.invited" });
    expect(preview.html).toContain(`background:${PRIMARY};`);
    expect(preview.html).toContain(`src="${LOGO}"`);
    expect((await open()).revision).toBe(0);
  });

  it("refuse un e-mail d'un autre espace (404)", async () => {
    await staff()
      .post(`${CHARTERS}/lfd/previews`)
      .send({ template: "customer.order-placed", locale: "fr" })
      .expect(404);
  });
});

/**
 * Point d.2 de `les-e-mails.md` (2026-11-07) : l'aperçu fidèle et le canevas
 * de l'éditeur d'un e-mail rendaient la charte de départ sous une charte
 * publiée.
 */
describe("les rendus de l'éditeur d'un e-mail suivent la charte publiée", () => {
  const EDITOR = "/admin/mail-templates";

  async function faithful(template: keyof B2bMails): Promise<string> {
    return jsonBody<MailDocumentPreviewView>(
      await staff()
        .post(`${EDITOR}/${template}/previews`)
        .send({ locale: "fr", source: "draft" })
        .expect(200),
    ).html;
  }

  async function fragments(template: keyof B2bMails): Promise<string> {
    const { document } = jsonBody<MailEditorView>(
      await staff().get(`${EDITOR}/${template}`).expect(200),
    );
    const parts = jsonBody<MailDocumentBlockPreviewView>(
      await staff()
        .post(`${EDITOR}/${template}/block-previews`)
        .send({ document, locale: "fr", source: "draft" })
        .expect(200),
    );
    return [parts.header, ...parts.blocks.map((block) => block.html), parts.footer].join("\n");
  }

  it.each(["staff.invited", "staff.account-alert"] as const)(
    "%s : l'aperçu et les fragments prennent la charte La Folie Douce publiée",
    async (template) => {
      const beforeFaithful = await faithful(template);
      const beforeFragments = await fragments(template);
      expect(beforeFaithful).not.toContain("La Folie Douce — équipe");

      const { starting } = await open();
      await draftAndPublish(lfdCharter(starting));

      const html = await faithful(template);
      expect(html).toContain(`src="${LOGO_COPY}"`);
      expect(html).toContain("La Folie Douce — équipe");
      expect(html).not.toBe(beforeFaithful);
      const parts = await fragments(template);
      expect(parts).toContain(`src="${LOGO_COPY}"`);
      expect(parts).toContain("La Folie Douce — équipe");
      expect(parts).not.toBe(beforeFragments);
    },
  );

  it("la charte La Folie Douce ne touche pas l'aperçu d'un e-mail client", async () => {
    const template = "customer.password-reset";
    const beforeFaithful = await faithful(template);
    const beforeFragments = await fragments(template);
    const { starting } = await open();
    await draftAndPublish(lfdCharter(starting));
    expect(await faithful(template)).toBe(beforeFaithful);
    expect(await fragments(template)).toBe(beforeFragments);
  });
});
