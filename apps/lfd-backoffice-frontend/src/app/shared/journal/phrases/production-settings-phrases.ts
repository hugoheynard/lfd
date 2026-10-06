import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import {
  byActor,
  inUnit,
  subject,
  subjectLabelOf,
  text,
  valueIn,
  type Phrase,
  type Segment,
} from '../phrase';
import { PRODUCTION_CLOSE_MODE } from '../values/orders-values';

/**
 * **Les réglages du fournil** (plan `documentation/production/arret-du-plan.md`,
 * lot A1) — le miroir de `PRODUCTION_SETTINGS_FACTS` dans `@lfd/contracts`.
 *
 * Le réglage d'arrêt se dit en entier, avant et après : un mode et l'heure qui
 * le règle tiennent en une expression. L'heure de l'autre mode, gardée pour
 * l'aller-retour, se dit aussi — sans quoi la phrase la perdrait.
 */

/** « manuel, alerte à 21:00, arrêt à 20:00 ». */
function closeTerms(raw: unknown): Segment[] {
  const settings = recordOf(raw);
  if (settings === null) {
    return [text('les valeurs par défaut')];
  }
  const hours: Segment[] = [];
  if (typeof settings['alertAt'] === 'string') {
    hours.push(text(', alerte à '), inUnit('clockTime', settings['alertAt']));
  }
  if (typeof settings['closeAt'] === 'string') {
    hours.push(text(', arrêt à '), inUnit('clockTime', settings['closeAt']));
  }
  return [valueIn(PRODUCTION_CLOSE_MODE, settings['mode'], { inSentence: true }), ...hours];
}

const closedDay =
  (verb: string): Phrase =>
  (fact) =>
    byActor(
      fact,
      [text(verb), subject(fact, inUnit('day', fact.payload['serviceDay']).text)],
      ['subjectLabel', 'serviceDay'],
    );

/**
 * « a ajouté Jeanne Martin aux destinataires du dossier du jour » (plan
 * `plan-envoi-du-dossier.md`, E2). Le fait ne porte pas l'adresse : le journal
 * n'écrit aucun e-mail.
 */
const dossierRecipient =
  (verb: string, tail: string): Phrase =>
  (fact) =>
    byActor(
      fact,
      [text(verb), subject(fact, subjectLabelOf(fact) ?? 'une personne'), text(tail)],
      ['subjectLabel', 'kind', 'staffUserId'],
    );

export const PRODUCTION_SETTINGS_PHRASES = {
  'production_settings.close_changed': (fact) =>
    byActor(
      fact,
      [
        text('a réglé l’arrêt du plan : '),
        ...closeTerms(fact.payload['after']),
        text(' ; c’était '),
        ...closeTerms(fact.payload['before']),
      ],
      ['before', 'after'],
    ),
  'production_closed_day.added': closedDay('a fermé le fournil le '),
  'production_closed_day.removed': closedDay('a rouvert le fournil le '),
  'production_dossier_recipient.added': dossierRecipient(
    'a ajouté ',
    ' aux destinataires du dossier du jour',
  ),
  'production_dossier_recipient.removed': dossierRecipient(
    'a retiré ',
    ' des destinataires du dossier du jour',
  ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
