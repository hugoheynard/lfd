import { MAIL_DATA_BLOCK_IDS, type MailResourceCard } from "@lfd/mail-blocks";

import { MAIL_COPY_VARIABLES } from "../../copy/mail-copy.variables.js";
import { b2bMailTemplates, type B2bMails } from "../../mail-templates.js";
import { mailBlockDeclarationOf } from "../../sections/mail-block-declarations.js";
import { MAIL_LAYOUTS } from "../../sections/mail-layouts.js";
import { MAIL_CASE_TABLES } from "../../specimens/cases/mail-specimen-cases.js";
import { mailKeys, renderMailData } from "../../specimens/mail-specimens.js";
import { MAIL_DATA_BLOCK_CARDS } from "../mail-data-block-cards.js";
import { MAIL_LINK_CARDS } from "../mail-link-cards.js";
import { MAIL_VALUE_CARDS, mailResourcesOf, mailValueCardOf } from "../mail-resources.js";
import { SAME_SENSE, type MailValueCard } from "../mail-value-card.types.js";

/**
 * La garde du lot R1 (plan `plan-editeur-par-blocs.md`, § 24) : aucune fiche
 * vide, aucun nom employé par deux e-mails sans que son sens soit décidé dans
 * chacun, aucune fiche orpheline, et des exemples tirés des données
 * d'exemple quand un cas rend la valeur.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

/** Les e-mails qui emploient chaque variable, lus sur la liste des variables permises. */
function usersByVariable(): ReadonlyMap<string, readonly string[]> {
  const users = new Map<string, string[]>();
  for (const mail of mailKeys()) {
    const names = new Set(Object.values(MAIL_COPY_VARIABLES[mail]).flat());
    for (const name of names) {
      users.set(name, [...(users.get(name) ?? []), mail]);
    }
  }
  return users;
}

const USERS = usersByVariable();

function blank(card: MailResourceCard | MailValueCard): readonly string[] {
  const fields: readonly (readonly [string, string])[] = [
    ["label", card.label],
    ["description", card.description],
    ...("example" in card ? [["example", card.example] as const] : []),
  ];
  return fields.filter(([, value]) => value.trim() === "").map(([field]) => field);
}

/** Toutes les fiches de valeurs : par défaut et précisées, nommées pour le message. */
function allValueCards(): readonly (readonly [string, MailValueCard])[] {
  return Object.entries(MAIL_VALUE_CARDS).flatMap(([name, entry]) => [
    [name, entry] as const,
    ...Object.entries(entry.senses ?? {}).flatMap(([mail, sense]) =>
      sense === SAME_SENSE ? [] : [[`${name} @ ${mail}`, sense] as const],
    ),
  ]);
}

describe("les fiches des valeurs", () => {
  it("couvrent les 54 variables relevées, et aucune autre", () => {
    expect(Object.keys(MAIL_VALUE_CARDS).sort()).toEqual([...USERS.keys()].sort());
    expect(USERS.size).toBe(54);
  });

  it("n'ont ni nom, ni description, ni exemple vides", () => {
    const empty = allValueCards().flatMap(([name, card]) =>
      blank(card).map((field) => `${name}.${field}`),
    );
    expect(empty).toEqual([]);
  });

  it("décident du sens d'un nom dans CHAQUE e-mail qui l'emploie, dès qu'il y en a deux", () => {
    const undecided = [...USERS].flatMap(([name, mails]) => {
      const senses = Object.entries(MAIL_VALUE_CARDS).find(([key]) => key === name)?.[1].senses;
      if (mails.length < 2) {
        return senses === undefined ? [] : [`${name} : un seul e-mail, pas de sens à préciser`];
      }
      const decided = Object.keys(senses ?? {});
      return mails.filter((mail) => !decided.includes(mail)).map((mail) => `${name} @ ${mail}`);
    });
    expect(undecided).toEqual([]);
  });

  it("ne précisent aucun sens pour un e-mail qui n'emploie pas le nom", () => {
    const orphans = Object.entries(MAIL_VALUE_CARDS).flatMap(([name, entry]) =>
      Object.keys(entry.senses ?? {})
        .filter((mail) => !(USERS.get(name) ?? []).includes(mail))
        .map((mail) => `${name} @ ${mail}`),
    );
    expect(orphans).toEqual([]);
  });

  /** `ref` et `reference` ne se fusionnent pas (réponse de Hugo, § 24) : deux sens, deux fiches. */
  it("distinguent la référence d'une commande, celle d'un mandat et celle d'un geste", () => {
    expect(mailValueCardOf("customer.order-placed", "ref")?.label).toBe("Référence de commande");
    expect(mailValueCardOf("customer.mandate-to-sign", "ref")?.label).toBe(
      "Référence du mandat (RUM)",
    );
    expect(mailValueCardOf("customer.sub-account-gesture", "reference")?.label).toBe(
      "Référence de l'objet du geste",
    );
  });
});

/** Les espaces insécables du format monétaire (`13,67 €`) ne font pas un autre exemple. */
function spaced(text: string): string {
  return text.replace(/[\u00a0\u202f]/gu, " ");
}

/** Les valeurs qu'un e-mail place réellement, par variable, sur tous ses cas (aperçu de l'éditeur). */
function renderedValues(mail: keyof B2bMails): ReadonlyMap<string, ReadonlySet<string>> {
  const values = new Map<string, Set<string>>();
  for (const { data } of MAIL_CASE_TABLES[mail].cases) {
    const rendered = renderMailData(
      REGISTRY,
      mail,
      data("fr"),
      {},
      {
        orders: {},
        markers: false,
        editor: { capture: () => undefined },
      },
    );
    let text = `${rendered.subject}\n${rendered.html}`
      .replace(/[^]*/gu, "")
      .replace(//gu, "")
      .replace(/&#39;/gu, "'")
      .replace(/&amp;/gu, "&");
    let previous = "";
    while (previous !== text) {
      previous = text;
      text = text.replace(/(\w+)([^]*)/gu, (_whole, name: string, value: string) => {
        values.set(name, (values.get(name) ?? new Set()).add(spaced(value)));
        return value;
      });
    }
  }
  return values;
}

describe("les exemples", () => {
  it.each(mailKeys())("de %s reprennent une valeur que ses cas rendent", (mail) => {
    const rendered = renderedValues(mail);
    const strays = mailResourcesOf(mail).values.flatMap((value) => {
      const seen = rendered.get(value.name);
      return seen === undefined || seen.has(spaced(value.example))
        ? []
        : [`${value.name} : « ${value.example} » ∉ ${[...seen].join(" | ")}`];
    });
    expect(strays).toEqual([]);
  });
});

describe("les liens", () => {
  it.each(mailKeys())("de %s suivent ses sections, avec une fiche pleine", (mail) => {
    const layout = MAIL_LAYOUTS[mail];
    const sections = layout.sections.map((section) => section.id);
    const links = mailResourcesOf(mail).links;
    expect(MAIL_LINK_CARDS[mail].cta !== undefined).toBe(sections.includes("cta"));
    expect(MAIL_LINK_CARDS[mail].secondaryLink !== undefined).toBe(
      sections.includes("secondaryLink"),
    );
    expect(links.map((link) => link.slot)).toEqual(
      sections.filter((id) => id === "cta" || id === "secondaryLink"),
    );
    expect(links.flatMap(blank)).toEqual([]);
  });

  it("disent du bouton ce que dit sa destination déclarée", () => {
    expect(mailResourcesOf("customer.order-placed").links[0]).toEqual({
      slot: "cta",
      label: "Liste de ses commandes",
      description: MAIL_LAYOUTS["customer.order-placed"].ctaDestination,
    });
  });
});

describe("les blocs de données", () => {
  it.each(mailKeys())("de %s sont ceux de sa déclaration, avec une fiche pleine", (mail) => {
    const declared = mailBlockDeclarationOf(mail).modelBlocks.filter((block) =>
      MAIL_DATA_BLOCK_IDS.some((id) => id === block),
    );
    const blocks = mailResourcesOf(mail).dataBlocks;
    expect(blocks.map((block) => block.block)).toEqual(declared);
    expect(Object.keys(MAIL_DATA_BLOCK_CARDS[mail]).sort()).toEqual([...declared].sort());
    expect(blocks.flatMap(blank)).toEqual([]);
  });
});

describe("les ressources d'un e-mail", () => {
  it("rangent chaque variable une fois, avec les phrases qui la portent", () => {
    const values = mailResourcesOf("customer.order-placed").values;
    expect(values.find((value) => value.name === "ref")).toEqual({
      name: "ref",
      label: "Référence de commande",
      description: MAIL_VALUE_CARDS.ref.description,
      example: "EXEMPLE-0001",
      phrases: ["subject", "intro", "qrAlt"],
    });
    expect(new Set(values.map((value) => value.name)).size).toBe(values.length);
  });

  it.each(mailKeys())("de %s ne perdent aucune variable", (mail) => {
    const names = new Set(Object.values(MAIL_COPY_VARIABLES[mail]).flat());
    expect(
      mailResourcesOf(mail)
        .values.map((value) => value.name)
        .sort(),
    ).toEqual([...names].sort());
  });
});
