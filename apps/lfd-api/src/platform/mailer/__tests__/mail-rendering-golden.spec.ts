import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { b2bMailTemplates, type B2bMails } from "../mail-templates.js";
import { MAIL_CASES } from "./rendering-golden/mail-rendering.cases.js";
import {
  fingerprintOf,
  type MailFingerprint,
} from "./rendering-golden/mail-rendering.fingerprint.js";

/**
 * **Non-régression du rendu des 28 e-mails, en français.**
 *
 * Les empreintes de `mail-rendering.golden.json` ont été capturées le
 * 2026-10-23 AVANT que les textes quittent les gabarits pour le dictionnaire
 * (plan `plan-textes-des-e-mails.md`, E1) : le déménagement ne devait changer
 * aucun octet — objet, HTML, pièces jointes —, et c'est ici qu'il le prouve.
 *
 * Une empreinte qui change n'est pas à « mettre à jour » par réflexe : elle
 * dit qu'un e-mail réellement envoyé a changé. Si c'est voulu (un texte
 * reformulé), on la régénère dans le même commit que la phrase, et le diff de
 * l'objet en clair le montre à la relecture.
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

function renderCase<K extends keyof B2bMails>(key: K, data: B2bMails[K]): MailFingerprint {
  return fingerprintOf(REGISTRY[key](data));
}

function casesOf<K extends keyof B2bMails>(key: K): readonly (readonly [string, B2bMails[K]])[] {
  return Object.entries(MAIL_CASES[key]);
}

const KEYS = Object.keys(MAIL_CASES) as readonly (keyof B2bMails)[];

it("couvre les 28 e-mails du registre, sans en oublier un", () => {
  expect([...KEYS].sort()).toEqual(Object.keys(REGISTRY).sort());
  expect(Object.keys(GOLDEN).sort()).toEqual(Object.keys(REGISTRY).sort());
  expect(KEYS).toHaveLength(28);
});

describe.each(KEYS)("le rendu de « %s »", (key) => {
  it.each(casesOf(key).map(([name]) => name))("est inchangé à l'octet — cas %s", (name) => {
    const data = MAIL_CASES[key][name];
    const expected = GOLDEN[key]?.[name];

    expect(expected).toBeDefined();
    expect(data).toBeDefined();
    if (data !== undefined) {
      expect(renderCase(key, data)).toEqual(expected);
    }
  });
});
