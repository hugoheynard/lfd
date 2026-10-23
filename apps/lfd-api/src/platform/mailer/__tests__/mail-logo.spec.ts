import { Buffer } from "node:buffer";

import type { RenderedMail } from "@lfd/mailer";

import { MAIL_LOGO_ATTACHMENT, MAIL_LOGO_CONTENT_ID } from "../mail-logo.js";
import { b2bMailTemplates, type B2bMails } from "../mail-templates.js";
import { MAIL_CASES } from "./rendering-golden/mail-rendering.cases.js";

/**
 * Le logo couleur en tête de TOUS les e-mails (2026-10-23) : la balise et la
 * pièce jointe viennent de deux endroits, et un e-mail qui n'aurait que l'une
 * montrerait une image cassée — ou transporterait 7 Ko pour rien.
 */
const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

function renderCases<K extends keyof B2bMails>(
  key: K,
): readonly (readonly [string, RenderedMail])[] {
  const cases: Readonly<Record<string, B2bMails[K]>> = MAIL_CASES[key];
  return Object.entries(cases).map(
    ([name, data]) => [`${key}/${name}`, REGISTRY[key](data)] as const,
  );
}

function renderAll(): readonly (readonly [string, RenderedMail])[] {
  return (Object.keys(MAIL_CASES) as (keyof B2bMails)[]).flatMap((key) => renderCases(key));
}

describe("le logo d'en-tête", () => {
  it.each(renderAll())("%s : cité une fois par cid:, et joint en DERNIÈRE pièce", (_name, mail) => {
    expect(mail.html.split(`src="cid:${MAIL_LOGO_CONTENT_ID}"`)).toHaveLength(2);
    expect(mail.html).toContain('alt="La Folie Coffee" width="63" height="56"');
    expect(mail.attachments?.at(-1)).toEqual(MAIL_LOGO_ATTACHMENT);
    // Le sous-titre du bandeau, propre à chaque e-mail (texte du dictionnaire).
    expect(mail.html).toMatch(/letter-spacing:0\.12em;text-transform:uppercase;">[^<]+<\/span>/u);
    expect(mail.attachments?.filter((a) => a.contentId === MAIL_LOGO_CONTENT_ID)).toHaveLength(1);
  });

  it("est un JPEG de 160 × 142, léger", () => {
    const bytes = Buffer.from(MAIL_LOGO_ATTACHMENT.contentBase64, "base64");
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(bytes.length).toBeLessThan(10_000);
    expect(MAIL_LOGO_ATTACHMENT.contentType).toBe("image/jpeg");
  });
});
