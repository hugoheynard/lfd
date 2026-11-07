import {
  MAIL_DATA_BLOCK_IDS,
  MAIL_LINK_SLOTS,
  type MailDataBlockResource,
  type MailEditorResources,
  type MailLinkResource,
  type MailValueResource,
} from "@lfd/mail-blocks";

import { MAIL_COPY_VARIABLES } from "../copy/mail-copy.variables.js";
import type { B2bMails } from "../mail-templates.js";
import { MAIL_LAYOUTS } from "../sections/mail-layouts.js";
import { BILLING_VALUE_CARDS } from "./billing-value-cards.js";
import { MAIL_DATA_BLOCK_CARDS } from "./mail-data-block-cards.js";
import { MAIL_LINK_CARDS } from "./mail-link-cards.js";
import { SAME_SENSE, type MailValueCard, type MailValueCards } from "./mail-value-card.types.js";
import { ORDER_VALUE_CARDS } from "./order-value-cards.js";
import { PEOPLE_VALUE_CARDS } from "./people-value-cards.js";

/**
 * **Le catalogue des fiches des valeurs** (plan `plan-editeur-par-blocs.md`,
 * § 24, R1) : une par variable que les e-mails emploient. Typé par
 * `MailVariableName` — une variable ajoutée au dictionnaire sans sa fiche ne
 * compile pas.
 */
export const MAIL_VALUE_CARDS: MailValueCards = {
  ...ORDER_VALUE_CARDS,
  ...BILLING_VALUE_CARDS,
  ...PEOPLE_VALUE_CARDS,
};

/** Une fiche lue sans son type exact : le sens par e-mail, indexé par clé. */
interface LooseValueCardEntry extends MailValueCard {
  readonly senses?: Readonly<Partial<Record<string, MailValueCard | typeof SAME_SENSE>>>;
}

const VALUE_CARDS: ReadonlyMap<string, LooseValueCardEntry> = new Map(
  Object.entries<LooseValueCardEntry>(MAIL_VALUE_CARDS),
);

/** La fiche d'une variable DANS cet e-mail : sa précision, sinon sa fiche par défaut. */
export function mailValueCardOf(mail: keyof B2bMails, name: string): MailValueCard | null {
  const entry = VALUE_CARDS.get(name);
  if (entry === undefined) {
    return null;
  }
  const sense = entry.senses?.[mail];
  if (sense === undefined || sense === SAME_SENSE) {
    return { label: entry.label, description: entry.description, example: entry.example };
  }
  return sense;
}

/** Les variables d'un e-mail, dans l'ordre de ses textes, avec les phrases qui les portent. */
function phrasesByVariable(mail: keyof B2bMails): ReadonlyMap<string, readonly string[]> {
  const byName = new Map<string, string[]>();
  for (const [path, names] of Object.entries(MAIL_COPY_VARIABLES[mail])) {
    for (const name of names) {
      byName.set(name, [...(byName.get(name) ?? []), path]);
    }
  }
  return byName;
}

function valuesOf(mail: keyof B2bMails): readonly MailValueResource[] {
  return [...phrasesByVariable(mail)].flatMap(([name, phrases]) => {
    const card = mailValueCardOf(mail, name);
    return card === null ? [] : [{ name, ...card, phrases }];
  });
}

function linksOf(mail: keyof B2bMails): readonly MailLinkResource[] {
  const cards = MAIL_LINK_CARDS[mail];
  const destination = MAIL_LAYOUTS[mail].ctaDestination;
  return MAIL_LINK_SLOTS.flatMap((slot): readonly MailLinkResource[] => {
    if (slot === "cta") {
      return cards.cta === undefined || destination === undefined
        ? []
        : [{ slot, label: cards.cta.label, description: destination }];
    }
    return cards.secondaryLink === undefined ? [] : [{ slot, ...cards.secondaryLink }];
  });
}

function dataBlocksOf(mail: keyof B2bMails): readonly MailDataBlockResource[] {
  const cards = MAIL_DATA_BLOCK_CARDS[mail];
  return MAIL_DATA_BLOCK_IDS.flatMap((block) => {
    const card = cards[block];
    return card === undefined ? [] : [{ block, ...card }];
  });
}

/**
 * **Les ressources d'un e-mail**, telles que l'éditeur les montre : ses
 * valeurs (fiche précisée pour cet e-mail), ses liens, ses blocs de données.
 * Une lecture du code : rien n'est écrit, rien d'envoyé ne change.
 */
export function mailResourcesOf(mail: keyof B2bMails): MailEditorResources {
  return { values: valuesOf(mail), links: linksOf(mail), dataBlocks: dataBlocksOf(mail) };
}
