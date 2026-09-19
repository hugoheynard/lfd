import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional, recordOf, text as orDash } from '../payload-read';
import { name, said, text, type Phrase, type Said } from '../phrase';

/**
 * **La vie d'une commande** — la passation, reprise de `factSentence` (plan des
 * phrases, lot C, 2026-09-19), et le colisage.
 */

/**
 * Le colisage : « Cécile Martin a déclaré la commande ORD-142 prête ».
 *
 * `readyBy` cite la fiche qui a scanné, sous son nom du moment (lot B). Les
 * lignes d'avant ne la citent que par son identifiant — et c'est alors
 * **l'auteur de la ligne** qui la nomme : le fait s'écrit dans le contexte de
 * la requête du scan (`POST …/sheets/:reference/packed` →
 * `OrderPackedEvent` → `MarkOrderReadyCommand` → `OrderReadyEvent` →
 * `OnOrderReady`, tout en processus, sans quitter le contexte de requête ;
 * vérifié le 2026-09-19). Seule réserve : un rescan qui rattrape un abonné en
 * échec écrit la ligne sous le nom de celui qui a RESCANNÉ, `readyBy` restant
 * celui du premier scan.
 */
function orderReady(fact: Parameters<Phrase>[0]): Said {
  const cited = recordOf(fact.payload['readyBy']);
  const readyBy = cited === null ? null : optional(cited['name']);
  const order = [
    text(' a déclaré la commande '),
    name(orDash(fact.payload['orderNumber'])),
    text(' prête'),
  ];
  if (readyBy !== null) {
    return said([name(readyBy), ...order], ['orderNumber', 'readyBy']);
  }
  // L'identifiant nu reste au détail (« (identifiant …) ») : c'est lui qui
  // départage le cas du rescan, où l'auteur n'est pas celui qui a colisé.
  return { ...said([text(fact.actor), ...order], ['orderNumber']), namesActor: true };
}

export const ORDERS_PHRASES = {
  // Le NUMÉRO d'abord : c'est par lui qu'on retrouve une commande, pas par son
  // identifiant technique.
  'order.placed': (fact) =>
    said(
      [text('Commande '), name(orDash(fact.payload['orderNumber'])), text(' passée')],
      ['orderNumber'],
    ),
  'order.ready': orderReady,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
