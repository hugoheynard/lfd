import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { b2bMailTemplates, type B2bMails } from "../mail-templates.js";
import { MAIL_CASES } from "./rendering-golden/mail-rendering.cases.js";
import {
  fingerprintOf,
  type MailFingerprint,
} from "./rendering-golden/mail-rendering.fingerprint.js";

/**
 * **Non-régression du rendu des 31 e-mails, en français.**
 *
 * Les empreintes de `mail-rendering.golden.json` ont été capturées le
 * 2026-10-23 AVANT que les textes quittent les gabarits pour le dictionnaire
 * (plan `plan-textes-des-e-mails.md`, E1) : le déménagement ne devait changer
 * aucun octet — objet, HTML, pièces jointes —, et c'est ici qu'il le prouve.
 *
 * Une empreinte qui change n'est pas à « mettre à jour » par réflexe : elle
 * dit qu'un e-mail réellement envoyé a changé. Si c'est voulu (un texte
 * reformulé), on la régénère dans le même commit que la phrase, et le diff de
 * l'objet en clair le montre à la relecture. *
 * **Régénérées le 2026-10-23** pour le nouveau bandeau d'en-tête des 28
 * e-mails (logo couleur sur pavé blanc, enseigne dans la face Chunk, sous-titre
 * `kicker` du dictionnaire) : vérifié avant de régénérer que, pour chaque cas,
 * l'objet était identique, que le HTML ne différait que par ce bandeau (un
 * bandeau neuf pour les quatre e-mails qui n'en avaient pas), et que les
 * pièces jointes ne gagnaient que le logo, en dernier.
 *
 * **Régénérées le 2026-10-23 (E4, S7)** pour les QUATRE cas d'une commande en
 * retrait (`customer.order-placed` paidPickup, account, free ;
 * `customer.order-ready` pickup), qui gagnent le bouton « Itinéraire vers la
 * boutique » : vérifié avant de régénérer que l'objet et les pièces jointes
 * étaient identiques, et que le HTML, ce seul bouton ôté, rendait l'empreinte
 * d'avant. Les 77 autres cas n'ont pas bougé — le rendu par sections, dans
 * l'ordre par défaut, est le rendu d'avant à l'octet.
 *
 * **Complétées le 2026-10-23 (M4 de la modification de commande)** : deux
 * e-mails neufs, `customer.order-change-applied` et `-refused`, leurs
 * empreintes ajoutées sans toucher aux existantes.
 *
 * **Régénérée le 2026-10-23 pour le SEUL `customer.order-change-applied`**,
 * qui porte désormais le nouveau total TTC et l'écart (plan de modification,
 * §14) : son cas `only` change d'empreinte, objet et pièces jointes
 * identiques ; deux cas neufs (`lower`, `unchanged`) parcourent les autres
 * branches de l'écart. Aucun autre cas n'a bougé.
 *
 * **Complétée le 2026-10-25 (E6d)** : un e-mail neuf,
 * `customer.order-shortfall`, son empreinte ajoutée sans toucher aux
 * existantes.
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

it("couvre les 31 e-mails du registre, sans en oublier un", () => {
  expect([...KEYS].sort()).toEqual(Object.keys(REGISTRY).sort());
  expect(Object.keys(GOLDEN).sort()).toEqual(Object.keys(REGISTRY).sort());
  expect(KEYS).toHaveLength(31);
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
