import {
  isEditablePhrase,
  startingMailDocument,
  type MailDocument,
  type MailLocale,
} from "@lfd/mail-blocks";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { embeddedMailCopyManifest } from "../../../copy/infrastructure/embedded-mail-copy-manifest.js";
import { b2bMailTemplates, type B2bMails } from "../../../templates/mail-templates.js";
import { mailBlockDeclarationOf } from "../../../templates/sections/mail-block-declarations.js";
import { stripEditorMarkers } from "../../../templates/sections/mail-editor-markers.js";
import type { MailLayoutScope } from "../../../templates/sections/mail-layout-scope.js";
import {
  mailCaseDataOf,
  mailCasesOf,
} from "../../../templates/specimens/cases/mail-specimen-cases.js";
import { mailKeys, renderMailData } from "../../../templates/specimens/mail-specimens.js";
import { phrasesOfTemplate } from "../../application/mail-editor-phrases.js";
import type { MailBlockPreviewRendering } from "../../domain/ports/mail-block-preview.renderer.js";
import { SpecimenMailBlockPreviewRenderer } from "../specimen-mail-block-preview.renderer.js";
import { SpecimenMailDocumentPreviewRenderer } from "../specimen-mail-document-preview.renderer.js";

/** Une config qui ne lit pas l'environnement : seule la marque des e-mails compte ici. */
class PreviewAppConfig extends AppConfig {
  override bootstrapAdminEmail(): string {
    return "admin@lfc.test";
  }

  override adminBaseUrl(): string | null {
    return "https://bo.lfc.test";
  }
}

/**
 * Lot S5f (plan § 22) : le canevas reçoit l'e-mail rendu bloc par bloc,
 * phrases et variables marquées — et ce marquage n'existe QUE là.
 */

const CONFIG = new PreviewAppConfig();
const BLOCKS = new SpecimenMailBlockPreviewRenderer(CONFIG);
const FAITHFUL = new SpecimenMailDocumentPreviewRenderer(CONFIG);
const MANIFEST = embeddedMailCopyManifest();
const PUBLICATION = { version: 0, publishedAt: null, publishedBy: null };

/**
 * Ce que `GET …/phrases` sert de cet e-mail, sans aucune réécriture, borné aux
 * phrases que l'éditeur écrit (§ 23) — ce que le handler passe : chemin → variante.
 */
function servedVariants(template: keyof B2bMails): ReadonlyMap<string, string | null> {
  const { phrases } = phrasesOfTemplate(template, MANIFEST, [], PUBLICATION, []);
  const declaration = mailBlockDeclarationOf(template);
  return new Map(
    phrases
      .filter((phrase) => isEditablePhrase(declaration, phrase.path))
      .map((phrase) => [phrase.path, phrase.variant] as const),
  );
}

function startingOf(template: keyof B2bMails): MailDocument {
  return startingMailDocument(template, mailBlockDeclarationOf(template));
}

/** Un document réarrangé : un paragraphe libre en tête, dans les trois langues. */
function rearrangedOf(template: keyof B2bMails): MailDocument {
  const starting = startingOf(template);
  return {
    ...starting,
    blocks: [
      {
        id: "libre-1",
        kind: "paragraph",
        text: { fr: "Merci <b>beaucoup</b>", en: "Thanks", it: "Grazie" },
      },
      ...starting.blocks,
    ],
  };
}

interface Rendered {
  readonly template: keyof B2bMails;
  readonly caseId: string;
  readonly locale: MailLocale;
  readonly parts: MailBlockPreviewRendering;
}

/** Chaque e-mail, chaque cas, chaque langue qu'il parle. */
function everyRendering(): readonly Rendered[] {
  return mailKeys().flatMap((template) =>
    mailBlockDeclarationOf(template).locales.flatMap((locale) =>
      mailCasesOf(template).map(({ id }) => ({
        template,
        caseId: id,
        locale,
        parts: BLOCKS.render(
          template,
          id,
          locale,
          {},
          rearrangedOf(template),
          servedVariants(template),
          null,
        ),
      })),
    ),
  );
}

function fragmentsOf(parts: MailBlockPreviewRendering): readonly string[] {
  return [parts.subject, parts.header, parts.footer, ...parts.blocks.map((block) => block.html)];
}

const ALL = everyRendering();

describe("l'aperçu par blocs : ce que les fragments portent", () => {
  it("rend les 32 e-mails", () => {
    expect(new Set(ALL.map((rendered) => rendered.template)).size).toBe(mailKeys().length);
  });

  it("un fragment par bloc du document, dans son ordre", () => {
    for (const { template, parts } of ALL) {
      expect(parts.blocks.map((block) => block.blockId)).toEqual(
        rearrangedOf(template).blocks.map((block) => block.id),
      );
    }
  });

  it("chaque data-phrase est un chemin servi par GET …/phrases, avec la variante servie", () => {
    for (const { template, caseId, parts } of ALL) {
      const variants = servedVariants(template);
      for (const html of fragmentsOf(parts)) {
        for (const match of html.matchAll(
          /<span data-phrase="([^"]+)"( data-variant="([^"]*)")?>/gu,
        )) {
          const [, path = "", , variant] = match;
          expect({ template, caseId, path, served: variants.has(path) }).toEqual({
            template,
            caseId,
            path,
            served: true,
          });
          const expected = variants.get(path) ?? null;
          expect({ path, variant: variant ?? null }).toEqual({
            path,
            variant:
              expected === null ? null : expected.replace(/'/gu, "&#39;").replace(/"/gu, "&quot;"),
          });
        }
      }
    }
  });

  it("« Commande passée » (§ 23) : l'accroche, l'objet et la ligne du QR sont marqués, pas le récapitulatif", () => {
    const paths = ALL.filter((rendered) => rendered.template === "customer.order-placed")
      .flatMap((rendered) => fragmentsOf(rendered.parts))
      .flatMap((html) => [...html.matchAll(/data-phrase="([^"]+)"/gu)].map(([, path]) => path));
    expect([...new Set(paths)].sort()).toEqual([
      "cta",
      "intro",
      "itinerary",
      "kicker",
      "qrLine",
      "subject",
      "title",
    ]);
  });

  it("c'est le cas qui décide quelle variante se voit, et l'autre n'est pas rendue", () => {
    const variantsShown = (caseId: string): string =>
      ALL.filter(
        (rendered) =>
          rendered.template === "customer.delivery-en-route" &&
          rendered.caseId === caseId &&
          rendered.locale === "fr",
      )
        .flatMap((rendered) => fragmentsOf(rendered.parts))
        .join("");
    const between = variantsShown("specimen");
    const before = variantsShown("before");
    expect(between).toContain('data-variant="Créneau borné"');
    expect(between).not.toContain('data-variant="Créneau « avant »"');
    expect(before).toContain('data-variant="Créneau « avant »"');
    expect(before).not.toContain('data-variant="Créneau borné"');
  });

  it("chaque e-mail montre au moins une phrase et une variable marquées", () => {
    for (const template of mailKeys()) {
      const all = ALL.filter((rendered) => rendered.template === template)
        .flatMap((rendered) => fragmentsOf(rendered.parts))
        .join("");
      expect({ template, phrase: all.includes("data-phrase=") }).toEqual({
        template,
        phrase: true,
      });
    }
    const all = ALL.flatMap((rendered) => fragmentsOf(rendered.parts)).join("");
    expect(all).toMatch(/<span data-var="\w+">/u);
  });

  it("le texte d'un bloc libre porte son identifiant et sa langue, échappé", () => {
    for (const { locale, parts } of ALL) {
      const free = parts.blocks.find((block) => block.blockId === "libre-1");
      const text = { fr: "Merci &lt;b&gt;beaucoup&lt;/b&gt;", en: "Thanks", it: "Grazie" }[locale];
      expect(free?.html).toContain(
        `<span data-free-block="libre-1" data-locale="${locale}">${text}</span>`,
      );
    }
  });

  it("aucun fragment ne porte de script, de gestionnaire d'événement ni de lien javascript:", () => {
    for (const { template, parts } of ALL) {
      for (const html of fragmentsOf(parts)) {
        expect({ template, script: /<script/iu.test(html) }).toEqual({ template, script: false });
        expect({ template, handler: /\son[a-z]+\s*=/iu.test(html) }).toEqual({
          template,
          handler: false,
        });
        expect({ template, js: /javascript:/iu.test(html) }).toEqual({ template, js: false });
      }
    }
  });

  it("les marqueurs sont équilibrés et aucun caractère de repère ne survit", () => {
    for (const { template, parts } of ALL) {
      for (const html of fragmentsOf(parts)) {
        expect({ template, leftover: /[\uE000-\uE005]/u.test(html) }).toEqual({
          template,
          leftover: false,
        });
        let depth = 0;
        for (const tag of html.matchAll(/<(\/?)span\b/gu)) {
          depth += tag[1] === "/" ? -1 : 1;
          expect(depth).toBeGreaterThanOrEqual(0);
        }
        expect({ template, depth }).toEqual({ template, depth: 0 });
      }
    }
  });

  it("les images du corps sont incrustées : aucun cid: dans un fragment", () => {
    for (const { parts } of ALL) {
      expect(fragmentsOf(parts).join("")).not.toContain("cid:");
    }
  });
});

describe("le marquage n'existe que dans l'aperçu de l'éditeur", () => {
  const REGISTRY = b2bMailTemplates({
    supportEmail: "admin@lfc.test",
    backOfficeUrl: "https://bo.lfc.test",
  });

  it.each(mailKeys())(
    "%s : le rendu en mode éditeur, repères ôtés, est l'e-mail envoyé à l'octet",
    (template) => {
      const pairs = mailBlockDeclarationOf(template).locales.flatMap((locale) =>
        mailCasesOf(template).map(({ id }) => ({ id, locale })),
      );
      for (const { id, locale } of pairs) {
        const data = mailCaseDataOf(template, id, locale);
        if (data === null) {
          throw new TypeError(`cas ${id} introuvable`);
        }
        const document = rearrangedOf(template);
        const sent: MailLayoutScope = {
          orders: {},
          markers: false,
          documents: { [template]: { document, locale } },
        };
        // L'aperçu fidèle rend par ce même périmètre (`documents`), sans éditeur.
        const plain = renderMailData(REGISTRY, template, data, {}, sent);
        const editor = renderMailData(
          REGISTRY,
          template,
          data,
          {},
          {
            ...sent,
            editor: { capture: () => undefined },
          },
        );
        expect(stripEditorMarkers(editor.html)).toBe(plain.html);
        expect(stripEditorMarkers(editor.subject)).toBe(plain.subject);
        expect((editor.attachments ?? []).map((a) => stripEditorMarkers(a.filename))).toEqual(
          (plain.attachments ?? []).map((a) => a.filename),
        );
        for (const rendered of [plain.html, plain.subject]) {
          expect(rendered).not.toMatch(/data-phrase|data-var|data-free-block|[\uE000-\uE005]/u);
        }
      }
    },
  );

  it.each(mailKeys())("%s : l'aperçu fidèle ne porte aucun marqueur de l'éditeur", (template) => {
    for (const { id } of mailCasesOf(template)) {
      const faithful = FAITHFUL.render(template, id, "fr", {}, rearrangedOf(template));
      expect(faithful.html).not.toMatch(/data-phrase|data-var|data-free-block/u);
      expect(faithful.subject).not.toMatch(/[\uE000-\uE005]/u);
    }
  });
});
