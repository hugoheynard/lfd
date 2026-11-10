import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TEXT_LINE_WIDTH } from "@lfd/mailer";

import { mailCopyOf } from "../copy/mail-copy.js";
import { b2bMailTemplates, type B2bMails } from "../mail-templates.js";
import { MAIL_CASES } from "./rendering-golden/mail-rendering.cases.js";

/**
 * **Non-régression de la version texte des 35 e-mails** (2026-11-08 ; le 34ᵉ, plan S2, et le 35ᵉ, la commande modifiée, le 2026-11-10) — la
 * partie `text/plain` que Resend envoie à côté du HTML.
 *
 * Empreintes à part (`mail-rendering-text.golden.json`) : celles du HTML, de
 * l'objet et des pièces jointes (`mail-rendering-golden.spec.ts`) n'ont pas
 * bougé d'un octet quand le texte est arrivé, et c'est ce que leur fichier
 * intact prouve. Capturées le 2026-11-08 à la naissance du texte ; trois
 * textes relus à l'œil (commande passée, commande prête, invitation).
 * Complétées le même jour de `customer.marketing-confirm` (C1, `fr` et `it`,
 * relus à l'œil), sans toucher aux existantes.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

type TextGolden = Readonly<
  Record<string, Readonly<Record<string, { readonly textSha256: string }>>>
>;

const GOLDEN = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./rendering-golden/mail-rendering-text.golden.json", import.meta.url)),
    "utf8",
  ),
) as TextGolden;

/** Ce que le rendu HTML pose et qu'un texte ne doit jamais garder : ses balises, ses entités. */
const MARKUP =
  /<\/?(?:p|a|h1|h2|img|table|tr|td|div|span|hr|br|html|body|head|style)\b|&(?:#\d+|[a-z]+);/iu;

function textOf<K extends keyof B2bMails>(key: K, data: B2bMails[K]): string {
  return REGISTRY[key](data).text ?? "";
}

function casesOf<K extends keyof B2bMails>(key: K): readonly (readonly [string, B2bMails[K]])[] {
  return Object.entries(MAIL_CASES[key]);
}

const KEYS = Object.keys(MAIL_CASES) as readonly (keyof B2bMails)[];

it("couvre les 35 e-mails du registre", () => {
  expect(Object.keys(GOLDEN).sort()).toEqual(Object.keys(REGISTRY).sort());
  expect(KEYS).toHaveLength(35);
});

describe.each(KEYS)("la version texte de « %s »", (key) => {
  it.each(casesOf(key).map(([name]) => name))("est inchangée — cas %s", (name) => {
    const data = MAIL_CASES[key][name];
    expect(data).toBeDefined();
    if (data === undefined) {
      return;
    }
    const text = textOf(key, data);

    expect(text).not.toBe("");
    expect(text).not.toMatch(MARKUP);
    // Une ligne trop longue n'est admise que si elle est une adresse, qu'on ne coupe pas.
    expect(
      text
        .split("\n")
        .filter((line) => line.length > TEXT_LINE_WIDTH && !/^https?:\/\/\S+$/u.test(line)),
    ).toEqual([]);
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(
      GOLDEN[key]?.[name]?.textSha256,
    );
  });
});

describe("la langue de l'envoi", () => {
  it("le texte parle la langue de l'e-mail, comme son HTML", () => {
    const data = MAIL_CASES["customer.payment-expired"]["only"];
    expect(data).toBeDefined();
    if (data === undefined) {
      return;
    }
    const english = textOf("customer.payment-expired", { ...data, locale: "en" });
    const title = mailCopyOf("en")["customer.payment-expired"].title;

    expect(title).not.toBe(mailCopyOf("fr")["customer.payment-expired"].title);
    expect(english).toContain(title);
  });
});
