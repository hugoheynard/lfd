import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional, text as orDash } from '../payload-read';
import { name, said, text, value, type Phrase } from '../phrase';

/**
 * **Les réglages qui décident du prix de livraison, du retrait et des heures
 * limites** — repris de `factSentence` (`settingSentence`, plan des phrases,
 * lot C, 2026-09-19) : mêmes mots, en segments.
 */

/** « <Nom> « <libellé> » <participe> » — le libellé figé de la charge. */
function labelled(noun: string, participle: string): Phrase {
  return (fact) =>
    said(
      [text(`${noun} « `), name(orDash(fact.payload['label'])), text(` » ${participle}`)],
      ['subjectLabel', 'label'],
    );
}

/** Une phrase fixe : le nom du sujet, s'il existe, est ajouté par le moteur. */
function fixed(sentence: string): Phrase {
  return () => said([text(sentence)], []);
}

export const SETTINGS_PHRASES = {
  'delivery_zone.created': labelled('Zone de livraison', 'créée'),
  'delivery_zone.updated': labelled('Zone de livraison', 'modifiée'),
  'delivery_zone.removed': fixed('Zone de livraison supprimée'),
  'pickup_address.created': labelled('Point de retrait', 'créé'),
  'pickup_address.updated': labelled('Point de retrait', 'modifié'),
  'pickup_address.removed': fixed('Point de retrait supprimé'),
  'pickup_address.default_set': fixed('Point de retrait par défaut changé'),
  // Le nombre de plages dit l'essentiel : passer de zéro à une ouvre les
  // créneaux publics du point, et c'est ce qu'un visiteur verra changer.
  'public_pickup_schedule.updated': (fact) => {
    const rules = count(fact.payload['ruleCount']);
    return said(
      [
        text('Créneaux publics de « '),
        name(orDash(fact.payload['label'])),
        text(' » réglés'),
        ...(rules === null ? [] : [text(' ('), value(`${rules} plage(s)`), text(')')]),
      ],
      ['subjectLabel', 'label', 'ruleCount'],
    );
  },
  'delivery_availability.updated': fixed('Livraison par clientèle réglée'),
  'order_cutoff.created': (fact) =>
    said([text('Heure limite posée à '), value(orDash(fact.payload['time']))], ['time']),
  'order_cutoff.updated': (fact) =>
    said([text('Heure limite portée à '), value(orDash(fact.payload['time']))], ['time']),
  'order_cutoff.removed': fixed('Heure limite supprimée'),
  // Une quantité est un NOMBRE : la lire comme une chaîne la rendrait « — », et
  // un engagement sans volume promis ne veut rien dire.
  'volume_commitment.signed': (fact) => {
    const promised = count(fact.payload['promisedQuantity']);
    return said(
      [
        text('Engagement de volume signé'),
        ...(promised === null ? [] : [text(' ('), value(promised.toString()), text(')')]),
      ],
      ['promisedQuantity'],
    );
  },
  'volume_commitment.closed': (fact) => {
    const reason = optional(fact.payload['reason']);
    return said(
      [text('Engagement de volume clos'), ...(reason === null ? [] : [text(` (${reason})`)])],
      ['reason'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
