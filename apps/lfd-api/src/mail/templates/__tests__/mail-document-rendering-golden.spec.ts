import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { startingMailDocument, type MailDocument } from "@lfd/mail-blocks";
import type { LayoutSectionId } from "@lfd/mailer";

import { b2bMailTemplates, type B2bMails } from "../mail-templates.js";
import { mailBlockDeclarationOf } from "../sections/mail-block-declarations.js";
import {
  NO_MAIL_LAYOUT,
  withMailLayout,
  type MailLayoutScope,
} from "../sections/mail-layout-scope.js";
import { MAIL_LAYOUTS } from "../sections/mail-layouts.js";
import { MAIL_CASES } from "./rendering-golden/mail-rendering.cases.js";
import {
  fingerprintOf,
  type MailFingerprint,
} from "./rendering-golden/mail-rendering.fingerprint.js";

/**
 * **Le document de départ rend les mêmes octets que la coquille** (plan
 * `plan-editeur-par-blocs.md`, § 4, S4b) — objet, HTML et pièces jointes, pour
 * les 32 e-mails, sur les jeux de données des empreintes
 * (`mail-rendering-golden.spec.ts`), et sous un ordre publié de sections.
 *
 * Un document réarrangé, lui, change le rendu : c'est voulu, et le dernier
 * bloc ne vérifie que ce qu'il ajoute.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

type Golden = Readonly<Record<string, Readonly<Record<string, MailFingerprint>>>>;

const GOLDEN = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./rendering-golden/mail-rendering.golden.json", import.meta.url)),
    "utf8",
  ),
) as Golden;

const KEYS = Object.keys(MAIL_CASES) as readonly (keyof B2bMails)[];

function render<K extends keyof B2bMails>(
  key: K,
  data: B2bMails[K],
  scope: MailLayoutScope,
): MailFingerprint {
  return withMailLayout(scope, () => fingerprintOf(REGISTRY[key](data)));
}

function documentScope(key: keyof B2bMails, document: MailDocument): MailLayoutScope {
  return { ...NO_MAIL_LAYOUT, documents: { [key]: { document, locale: "fr" } } };
}

function casesOf<K extends keyof B2bMails>(key: K): readonly (readonly [string, B2bMails[K]])[] {
  return Object.entries(MAIL_CASES[key]);
}

/**
 * Un ordre publié qui renverse les blocs du modèle, le lien secondaire
 * toujours sous son bouton — la seule forme qu'un document sait dire.
 */
function reversedOrder(key: keyof B2bMails): readonly LayoutSectionId[] {
  const sections = MAIL_LAYOUTS[key].sections.map((section) => section.id);
  const blocks = [...mailBlockDeclarationOf(key).modelBlocks].reverse();
  return blocks.flatMap((block) =>
    sections.filter((id) => id === block || (block === "cta" && id === "secondaryLink")),
  );
}

it("couvre les 32 e-mails du registre", () => {
  expect(KEYS).toHaveLength(32);
});

describe.each(KEYS)("le document de départ de « %s »", (key) => {
  const declaration = mailBlockDeclarationOf(key);

  it.each(casesOf(key).map(([name]) => name))(
    "rend l'empreinte de la coquille — cas %s",
    (name) => {
      const data = MAIL_CASES[key][name];
      const document = startingMailDocument(key, declaration);

      expect(data).toBeDefined();
      if (data !== undefined) {
        expect(render(key, data, documentScope(key, document))).toEqual(GOLDEN[key]?.[name]);
      }
    },
  );

  it.each(casesOf(key).map(([name]) => name))(
    "rend la coquille sous un ordre publié — cas %s",
    (name) => {
      const data = MAIL_CASES[key][name];
      const order = reversedOrder(key);
      const document = startingMailDocument(key, declaration, order);

      expect(data).toBeDefined();
      if (data !== undefined) {
        const today = render(key, data, { ...NO_MAIL_LAYOUT, orders: { [key]: order } });
        expect(render(key, data, documentScope(key, document))).toEqual(today);
      }
    },
  );
});

describe("un document réarrangé", () => {
  const key = "customer.order-ready" as const;
  const [, data] = casesOf(key)[0] ?? [];
  const starting = startingMailDocument(key, mailBlockDeclarationOf(key));
  const rearranged: MailDocument = {
    template: key,
    blocks: [
      ...starting.blocks,
      { id: "free:notice", kind: "callout", tone: "info", text: { fr: "Fermé le 1er mai" } },
    ],
  };

  it("garde l'objet et les pièces jointes, et ajoute son bloc et sa variante sombre", () => {
    expect(data).toBeDefined();
    if (data !== undefined) {
      const before = REGISTRY[key](data);
      const after = withMailLayout(documentScope(key, rearranged), () => REGISTRY[key](data));

      expect(after.subject).toBe(before.subject);
      expect(after.attachments).toEqual(before.attachments);
      expect(after.html).toContain("Fermé le 1er mai");
      expect(after.html).toContain("prefers-color-scheme:dark");
      expect(before.html).not.toContain("prefers-color-scheme");
    }
  });
});
