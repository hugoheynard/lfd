import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, text, type Phrase, type PhraseFact, type Segment } from '../phrase';
import { formatUnit } from '../units';

/**
 * **Le réglage global de livraison par audience** (`delivery_pricing.updated`,
 * plan `plan-livraison-offerte.md`, 0b) — le miroir du fait dans
 * `@lfd/contracts`.
 *
 * La phrase dit le frais de chaque clientèle qui a CHANGÉ, avec sa nouvelle
 * valeur : « a réglé le frais de livraison des professionnels à 9,00 € ». Le
 * franco n'est pas encore appliqué (lot 1) : la phrase n'en parle pas, le
 * détail le garde.
 */

const AUDIENCES = [
  { key: 'b2b', of: 'des professionnels' },
  { key: 'b2c', of: 'des particuliers' },
] as const;

/** « 9,00 € » ou « 10 % ». */
function feeText(fee: unknown): string {
  const read = recordOf(fee);
  if (read === null) {
    return '—';
  }
  const bp = formatUnit('basisPoints', read['bp']);
  return bp ?? formatUnit('cents', read['cents']) ?? '—';
}

function sameFee(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function deliveryPricing(fact: PhraseFact): Segment[] {
  const previous = recordOf(fact.payload['previous']);
  const changes: string[] = [];
  for (const { key, of } of AUDIENCES) {
    const after = recordOf(fact.payload[key]);
    const before = recordOf(previous?.[key]);
    if (after === null || sameFee(after['fee'], before?.['fee'])) {
      continue;
    }
    changes.push(
      after['fee'] === null
        ? `a retiré le frais de livraison ${of} : chaque zone reprend son ancien frais`
        : `a réglé le frais de livraison ${of} à ${feeText(after['fee'])}`,
    );
  }
  return [text(changes.length === 0 ? 'a réglé le prix de la livraison' : changes.join(' et '))];
}

export const DELIVERY_PRICING_PHRASES = {
  'delivery_pricing.updated': (fact) => byActor(fact, deliveryPricing(fact), []),
} satisfies Partial<Record<JournalFactType, Phrase>>;
