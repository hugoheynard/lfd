import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  cite,
  inUnit,
  subject,
  subjectLabelOf,
  text,
  value,
  valueIn,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { BILLING_RHYTHM_KIND } from '../values/accounting-values';
import { billingRhythm, ENTITY, entity } from './accounting-phrases';

/**
 * **Les dates des modes, le mode d'un payeur** (lot M1, plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §16.6-7). À part de `accounting-phrases.ts`, qui dépasse déjà la taille
 * d'un fichier. Guide : en tête de `phrase-registry.ts`.
 */

/** Les dates d'un mode, dites comme un rythme : « chaque semaine le mercredi ». */
function modeDates(mode: unknown, days: unknown): string {
  return billingRhythm({ kind: mode, days });
}

/**
 * « a programmé les dates du mode Chaque semaine de l'entité émettrice « X » :
 * chaque semaine le mercredi, à partir du … (au lieu de chaque semaine le
 * lundi) » — ou l'annulation d'un programmé.
 */
const billingModeDatesChanged: Phrase = (fact) => {
  const mode = fact.payload['mode'];
  const from = modeDates(mode, fact.payload['from']);
  const to = modeDates(mode, fact.payload['to']);
  const keys = ['subjectLabel', 'mode', 'from', 'to', 'effectiveAt', 'cancelled'];
  const ofMode = [text('les dates du mode '), valueIn(BILLING_RHYTHM_KIND, mode), text(' ')];
  if (fact.payload['cancelled'] === true) {
    return byActor(
      fact,
      [
        text('a annulé le changement programmé pour le '),
        inUnit('instant', fact.payload['effectiveAt']),
        text(' : '),
        ...ofMode,
        ...entity(fact, 'de'),
        text(' restent '),
        value(to),
        text(' (au lieu de '),
        value(from),
        text(')'),
      ],
      keys,
    );
  }
  return byActor(
    fact,
    [
      text('a programmé '),
      ...ofMode,
      ...entity(fact, 'de'),
      text(' : '),
      value(to),
      text(', à partir du '),
      inUnit('instant', fact.payload['effectiveAt']),
      text(' (au lieu de '),
      value(from),
      text(')'),
    ],
    keys,
  );
};

/** Le payeur, sujet de la ligne : « « Le Bistrot » », lié à sa fiche. */
function payer(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('un client')] : [text('« '), subject(fact, label), text(' »')];
}

/**
 * « a programmé le mode de facturation de « Le Bistrot » chez l'entité
 * émettrice « X » : Chaque semaine, à partir du … (au lieu de Mensuel) » — ou
 * l'annulation d'un passage programmé.
 */
const payerBillingModeChanged: Phrase = (fact) => {
  const keys = ['subjectLabel', 'legalEntity', 'from', 'to', 'effectiveAt', 'cancelled'];
  const atEntity = [text(' chez '), ...cite(ENTITY[''], fact.payload['legalEntity'])];
  if (fact.payload['cancelled'] === true) {
    return byActor(
      fact,
      [
        text('a annulé le passage de '),
        ...payer(fact),
        text(' au mode '),
        valueIn(BILLING_RHYTHM_KIND, fact.payload['from'], { inSentence: true }),
        text(' prévu le '),
        inUnit('instant', fact.payload['effectiveAt']),
        ...atEntity,
        text(' : il reste au mode '),
        valueIn(BILLING_RHYTHM_KIND, fact.payload['to'], { inSentence: true }),
      ],
      keys,
    );
  }
  return byActor(
    fact,
    [
      text('a programmé le mode de facturation de '),
      ...payer(fact),
      ...atEntity,
      text(' : '),
      valueIn(BILLING_RHYTHM_KIND, fact.payload['to'], { inSentence: true }),
      text(', à partir du '),
      inUnit('instant', fact.payload['effectiveAt']),
      text(' (au lieu de '),
      valueIn(BILLING_RHYTHM_KIND, fact.payload['from'], { inSentence: true }),
      text(')'),
    ],
    keys,
  );
};

export const BILLING_MODE_PHRASES = {
  'legal_entity.billing_mode_dates_changed': billingModeDatesChanged,
  'payer.billing_mode_changed': payerBillingModeChanged,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
