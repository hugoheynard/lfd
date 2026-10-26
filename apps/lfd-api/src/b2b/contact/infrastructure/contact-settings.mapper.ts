import type { ContactCardText, ContactLocalizedText, ContactSettingsView } from "@lfd/contracts";

/** Une carte telle que la table la range : un préfixe `b2b` ou `b2c`, puis ces colonnes. */
interface CardColumns {
  readonly kickerFr: string;
  readonly kickerEn: string;
  readonly kickerIt: string;
  readonly titleFr: string;
  readonly titleEn: string;
  readonly titleIt: string;
  readonly bodyFr: string;
  readonly bodyEn: string;
  readonly bodyIt: string;
  readonly callLabelFr: string;
  readonly callLabelEn: string;
  readonly callLabelIt: string;
  readonly writeLabelFr: string;
  readonly writeLabelEn: string;
  readonly writeLabelIt: string;
  readonly showPhone: boolean;
  readonly showForm: boolean;
  readonly noContactMessageFr: string;
  readonly noContactMessageEn: string;
  readonly noContactMessageIt: string;
}

/** Les colonnes de la ligne `contact_settings`, telles que Prisma les nomme. */
export interface ContactSettingsColumns {
  readonly b2bKickerFr: string;
  readonly b2bKickerEn: string;
  readonly b2bKickerIt: string;
  readonly b2bTitleFr: string;
  readonly b2bTitleEn: string;
  readonly b2bTitleIt: string;
  readonly b2bBodyFr: string;
  readonly b2bBodyEn: string;
  readonly b2bBodyIt: string;
  readonly b2bCallLabelFr: string;
  readonly b2bCallLabelEn: string;
  readonly b2bCallLabelIt: string;
  readonly b2bWriteLabelFr: string;
  readonly b2bWriteLabelEn: string;
  readonly b2bWriteLabelIt: string;
  readonly b2bShowPhone: boolean;
  readonly b2bShowForm: boolean;
  readonly b2bNoContactMessageFr: string;
  readonly b2bNoContactMessageEn: string;
  readonly b2bNoContactMessageIt: string;
  readonly b2cKickerFr: string;
  readonly b2cKickerEn: string;
  readonly b2cKickerIt: string;
  readonly b2cTitleFr: string;
  readonly b2cTitleEn: string;
  readonly b2cTitleIt: string;
  readonly b2cBodyFr: string;
  readonly b2cBodyEn: string;
  readonly b2cBodyIt: string;
  readonly b2cCallLabelFr: string;
  readonly b2cCallLabelEn: string;
  readonly b2cCallLabelIt: string;
  readonly b2cWriteLabelFr: string;
  readonly b2cWriteLabelEn: string;
  readonly b2cWriteLabelIt: string;
  readonly b2cShowPhone: boolean;
  readonly b2cShowForm: boolean;
  readonly b2cNoContactMessageFr: string;
  readonly b2cNoContactMessageEn: string;
  readonly b2cNoContactMessageIt: string;
}

const text = (fr: string, en: string, it: string): ContactLocalizedText => ({ fr, en, it });

function cardOf(c: CardColumns): ContactCardText {
  return {
    kicker: text(c.kickerFr, c.kickerEn, c.kickerIt),
    title: text(c.titleFr, c.titleEn, c.titleIt),
    body: text(c.bodyFr, c.bodyEn, c.bodyIt),
    callLabel: text(c.callLabelFr, c.callLabelEn, c.callLabelIt),
    writeLabel: text(c.writeLabelFr, c.writeLabelEn, c.writeLabelIt),
    showPhone: c.showPhone,
    showForm: c.showForm,
    noContactMessage: text(c.noContactMessageFr, c.noContactMessageEn, c.noContactMessageIt),
  };
}

function columnsOfCard(card: ContactCardText): CardColumns {
  return {
    kickerFr: card.kicker.fr,
    kickerEn: card.kicker.en,
    kickerIt: card.kicker.it,
    titleFr: card.title.fr,
    titleEn: card.title.en,
    titleIt: card.title.it,
    bodyFr: card.body.fr,
    bodyEn: card.body.en,
    bodyIt: card.body.it,
    callLabelFr: card.callLabel.fr,
    callLabelEn: card.callLabel.en,
    callLabelIt: card.callLabel.it,
    writeLabelFr: card.writeLabel.fr,
    writeLabelEn: card.writeLabel.en,
    writeLabelIt: card.writeLabel.it,
    showPhone: card.showPhone,
    showForm: card.showForm,
    noContactMessageFr: card.noContactMessage.fr,
    noContactMessageEn: card.noContactMessage.en,
    noContactMessageIt: card.noContactMessage.it,
  };
}

/** Ligne → cartes. */
export function cardsOf(row: ContactSettingsColumns): ContactSettingsView["cards"] {
  return {
    b2b: cardOf({
      kickerFr: row.b2bKickerFr,
      kickerEn: row.b2bKickerEn,
      kickerIt: row.b2bKickerIt,
      titleFr: row.b2bTitleFr,
      titleEn: row.b2bTitleEn,
      titleIt: row.b2bTitleIt,
      bodyFr: row.b2bBodyFr,
      bodyEn: row.b2bBodyEn,
      bodyIt: row.b2bBodyIt,
      callLabelFr: row.b2bCallLabelFr,
      callLabelEn: row.b2bCallLabelEn,
      callLabelIt: row.b2bCallLabelIt,
      writeLabelFr: row.b2bWriteLabelFr,
      writeLabelEn: row.b2bWriteLabelEn,
      writeLabelIt: row.b2bWriteLabelIt,
      showPhone: row.b2bShowPhone,
      showForm: row.b2bShowForm,
      noContactMessageFr: row.b2bNoContactMessageFr,
      noContactMessageEn: row.b2bNoContactMessageEn,
      noContactMessageIt: row.b2bNoContactMessageIt,
    }),
    b2c: cardOf({
      kickerFr: row.b2cKickerFr,
      kickerEn: row.b2cKickerEn,
      kickerIt: row.b2cKickerIt,
      titleFr: row.b2cTitleFr,
      titleEn: row.b2cTitleEn,
      titleIt: row.b2cTitleIt,
      bodyFr: row.b2cBodyFr,
      bodyEn: row.b2cBodyEn,
      bodyIt: row.b2cBodyIt,
      callLabelFr: row.b2cCallLabelFr,
      callLabelEn: row.b2cCallLabelEn,
      callLabelIt: row.b2cCallLabelIt,
      writeLabelFr: row.b2cWriteLabelFr,
      writeLabelEn: row.b2cWriteLabelEn,
      writeLabelIt: row.b2cWriteLabelIt,
      showPhone: row.b2cShowPhone,
      showForm: row.b2cShowForm,
      noContactMessageFr: row.b2cNoContactMessageFr,
      noContactMessageEn: row.b2cNoContactMessageEn,
      noContactMessageIt: row.b2cNoContactMessageIt,
    }),
  };
}

/** Cartes → ligne. */
export function columnsOf(cards: ContactSettingsView["cards"]): ContactSettingsColumns {
  const b2b = columnsOfCard(cards.b2b);
  const b2c = columnsOfCard(cards.b2c);
  return {
    b2bKickerFr: b2b.kickerFr,
    b2bKickerEn: b2b.kickerEn,
    b2bKickerIt: b2b.kickerIt,
    b2bTitleFr: b2b.titleFr,
    b2bTitleEn: b2b.titleEn,
    b2bTitleIt: b2b.titleIt,
    b2bBodyFr: b2b.bodyFr,
    b2bBodyEn: b2b.bodyEn,
    b2bBodyIt: b2b.bodyIt,
    b2bCallLabelFr: b2b.callLabelFr,
    b2bCallLabelEn: b2b.callLabelEn,
    b2bCallLabelIt: b2b.callLabelIt,
    b2bWriteLabelFr: b2b.writeLabelFr,
    b2bWriteLabelEn: b2b.writeLabelEn,
    b2bWriteLabelIt: b2b.writeLabelIt,
    b2bShowPhone: b2b.showPhone,
    b2bShowForm: b2b.showForm,
    b2bNoContactMessageFr: b2b.noContactMessageFr,
    b2bNoContactMessageEn: b2b.noContactMessageEn,
    b2bNoContactMessageIt: b2b.noContactMessageIt,
    b2cKickerFr: b2c.kickerFr,
    b2cKickerEn: b2c.kickerEn,
    b2cKickerIt: b2c.kickerIt,
    b2cTitleFr: b2c.titleFr,
    b2cTitleEn: b2c.titleEn,
    b2cTitleIt: b2c.titleIt,
    b2cBodyFr: b2c.bodyFr,
    b2cBodyEn: b2c.bodyEn,
    b2cBodyIt: b2c.bodyIt,
    b2cCallLabelFr: b2c.callLabelFr,
    b2cCallLabelEn: b2c.callLabelEn,
    b2cCallLabelIt: b2c.callLabelIt,
    b2cWriteLabelFr: b2c.writeLabelFr,
    b2cWriteLabelEn: b2c.writeLabelEn,
    b2cWriteLabelIt: b2c.writeLabelIt,
    b2cShowPhone: b2c.showPhone,
    b2cShowForm: b2c.showForm,
    b2cNoContactMessageFr: b2c.noContactMessageFr,
    b2cNoContactMessageEn: b2c.noContactMessageEn,
    b2cNoContactMessageIt: b2c.noContactMessageIt,
  };
}
