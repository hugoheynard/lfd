import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, text, type Phrase, type PhraseFact, type Segment } from '../phrase';

/**
 * **Le jour même, et l'interrupteur retiré** — le miroir de
 * `order_cutoff_settings.updated` dans `@lfd/contracts`.
 *
 * Depuis le 2026-10-21, la charge porte le jour même et l'heure limite du
 * réassort boutique (`resupplyCutoffTime`, lot R3a) ; les lignes du même jour
 * d'avant R3a portent l'interrupteur `resupplySubjectToCutoff`, celles d'avant
 * aussi `enabled` (l'interrupteur de l'heure limite générale, lot O3), et leur
 * phrase le dit toujours. Depuis le 2026-11-02 (lot L3), elle porte aussi les
 * réglages du circuit du jour J.
 */
/** L'avant et l'après d'une clé booléenne, ou `null` si la charge ne les porte pas. */
function change(fact: PhraseFact, key: string): { before: boolean; after: boolean } | null {
  const before = recordOf(fact.payload['previous'])?.[key];
  const after = fact.payload[key];
  return typeof before === 'boolean' && typeof after === 'boolean' ? { before, after } : null;
}

/** Les phrases des clés qui ont changé, dans l'ordre de l'écran. */
function changes(fact: PhraseFact): string[] {
  const said: string[] = [];
  const enabled = change(fact, 'enabled');
  if (enabled !== null && enabled.before !== enabled.after) {
    said.push(
      enabled.after
        ? 'a réactivé l’heure limite générale de commande'
        : 'a désactivé l’heure limite générale de commande ; seuls l’arrêt du plan et les limites des articles ferment encore une journée',
    );
  }
  const sameDay = change(fact, 'sameDayAllowed');
  if (sameDay !== null && sameDay.before !== sameDay.after) {
    said.push(
      sameDay.after
        ? 'a autorisé les commandes pour le jour même'
        : 'a fermé les commandes pour le jour même',
    );
  }
  const resupply = change(fact, 'resupplySubjectToCutoff');
  if (resupply !== null && resupply.before !== resupply.after) {
    said.push(
      resupply.after
        ? 'a soumis le réassort boutique à l’heure limite générale'
        : 'a levé l’heure limite pour le réassort boutique',
    );
  }
  const time = timeChange(fact);
  if (time !== null && time.before !== time.after) {
    said.push(`a réglé l’heure limite du réassort boutique à la veille, ${time.after}`);
  }
  for (const [key, gesture] of NUDGE_DELAYS) {
    const delay = minutesChange(fact, key);
    if (delay !== null && delay.before !== delay.after) {
      said.push(`a réglé « ${gesture} » à ${String(delay.after)} min après le retard`);
    }
  }
  // La tolérance de retard (2026-11-03) : absente des faits d'avant.
  const tolerance = minutesChange(fact, LATE_TOLERANCE);
  if (tolerance !== null && tolerance.before !== tolerance.after) {
    said.push(`a réglé la tolérance de retard à ${String(tolerance.after)} min`);
  }
  return [...said, ...circuitChanges(fact)];
}

/**
 * Les réglages du circuit du jour J (lot L3, 2026-11-02) : les interrupteurs
 * par clientèle, et la phrase de chaque sens.
 */
const CIRCUIT_SWITCHES = [
  [
    'sameDayPublicAllowed',
    'a autorisé les particuliers à commander pour aujourd’hui sur le stock de la vitrine',
    'a fermé aux particuliers la commande pour aujourd’hui sur le stock de la vitrine',
  ],
  [
    'sameDayProAllowed',
    'a autorisé les pros à commander pour aujourd’hui sur le stock de la vitrine',
    'a fermé aux pros la commande pour aujourd’hui sur le stock de la vitrine',
  ],
  [
    'sameDayProOnline',
    'a ouvert aux pros la commande en ligne pour aujourd’hui',
    'a fermé aux pros la commande en ligne pour aujourd’hui',
  ],
] as const;

/** Ce que devient un pro sans crédit au comptoir, dit en clair. */
const WITHOUT_CREDIT: Readonly<Record<string, string>> = {
  refuse: 'sa commande pour aujourd’hui est refusée',
  payment_link: 'il reçoit un lien de paiement',
};

/** Les phrases des réglages du jour J qui ont changé (lignes d'après le 2026-11-02). */
function circuitChanges(fact: PhraseFact): string[] {
  const said: string[] = [];
  for (const [key, on, off] of CIRCUIT_SWITCHES) {
    const switched = change(fact, key);
    if (switched !== null && switched.before !== switched.after) {
      said.push(switched.after ? on : off);
    }
  }
  const credit = stringChange(fact, 'sameDayProWithoutCredit');
  const creditSaid = credit === null ? undefined : WITHOUT_CREDIT[credit.after];
  if (credit !== null && credit.before !== credit.after && creditSaid !== undefined) {
    said.push(`a réglé qu’un pro sans crédit au compte, au comptoir : ${creditSaid}`);
  }
  const hold = minutesChange(fact, 'shelfHoldMinutes');
  if (hold !== null && hold.before !== hold.after) {
    said.push(`a réglé à ${String(hold.after)} min la tenue du stock par un paiement en cours`);
  }
  return said;
}

/** L'avant et l'après d'une clé texte, ou `null` si la charge ne les porte pas. */
function stringChange(fact: PhraseFact, key: string): { before: string; after: string } | null {
  const before = recordOf(fact.payload['previous'])?.[key];
  const after = fact.payload[key];
  return typeof before === 'string' && typeof after === 'string' ? { before, after } : null;
}

/** Les clés du jour J que la charge porte (lignes d'après le 2026-11-02). */
function circuitKeys(fact: PhraseFact): string[] {
  const switches = CIRCUIT_SWITCHES.map(([key]) => key).filter((key) => change(fact, key) !== null);
  const credit =
    stringChange(fact, 'sameDayProWithoutCredit') === null ? [] : ['sameDayProWithoutCredit'];
  const hold = minutesChange(fact, 'shelfHoldMinutes') === null ? [] : ['shelfHoldMinutes'];
  return [...switches, ...credit, ...hold];
}

/** Les délais des deux relances d'un retrait en retard (2026-10-25), et le nom de leur geste. */
const NUDGE_DELAYS = [
  ['pickupReminderDelayMinutes', 'Rappel au client'],
  ['delayWarningDelayMinutes', 'Avertir le client'],
] as const;

/** La tolérance de retard (2026-11-03) : en deçà, aucun retard n'est dit. */
const LATE_TOLERANCE = 'lateToleranceMinutes';

/** L'avant et l'après d'un délai en minutes, ou `null` (ligne d'avant le 2026-10-25). */
function minutesChange(fact: PhraseFact, key: string): { before: number; after: number } | null {
  const before = recordOf(fact.payload['previous'])?.[key];
  const after = fact.payload[key];
  return typeof before === 'number' && typeof after === 'number' ? { before, after } : null;
}

/** L'avant et l'après de l'heure du réassort (lot R3a), ou `null`. */
function timeChange(fact: PhraseFact): { before: string; after: string } | null {
  const before = recordOf(fact.payload['previous'])?.['resupplyCutoffTime'];
  const after = fact.payload['resupplyCutoffTime'];
  return typeof before === 'string' && typeof after === 'string' ? { before, after } : null;
}

/** La charge porte au moins l'avant et l'après du jour même. */
function readable(fact: PhraseFact): boolean {
  return change(fact, 'sameDayAllowed') !== null;
}

/**
 * Les clés que la phrase a dites : `enabled` seulement sur une ligne d'avant le
 * 2026-10-21, `resupplySubjectToCutoff` seulement sur une ligne du même jour
 * d'avant le lot R3a, `resupplyCutoffTime` sur une ligne d'après, et les
 * deux délais de relance sur une ligne d'après le 2026-10-25.
 */
function saidKeys(fact: PhraseFact): string[] {
  if (!readable(fact)) {
    return [];
  }
  const optional = ['enabled', 'resupplySubjectToCutoff'].filter(
    (key) => change(fact, key) !== null,
  );
  const time = timeChange(fact) === null ? [] : ['resupplyCutoffTime'];
  const delays = [...NUDGE_DELAYS.map(([key]) => key), LATE_TOLERANCE].filter(
    (key) => minutesChange(fact, key) !== null,
  );
  return [...optional, ...time, ...delays, ...circuitKeys(fact), 'sameDayAllowed', 'previous'];
}

function orderCutoffSettings(fact: PhraseFact): Segment[] {
  const said = changes(fact);
  if (said.length > 0) {
    return [text(said.join(' et '))];
  }
  return [text(readable(fact) ? 'a réglé le jour même sans le changer' : 'a réglé le jour même')];
}

export const ORDER_CUTOFF_SETTINGS_PHRASES = {
  'order_cutoff_settings.updated': (fact) =>
    byActor(fact, orderCutoffSettings(fact), saidKeys(fact)),
} satisfies Partial<Record<JournalFactType, Phrase>>;
