import { describe, expect, it } from 'vitest';

import type {
  FulfillmentMethod,
  FulfillmentSource,
  HandoverQueueEntryView,
  HandoverQueueState,
  HandoverQueueWindowView,
  HandoverVia,
  OrderHandoverView,
} from '@lfd/contracts';

import {
  atTheCounter,
  clockOf,
  entriesForTab,
  formatHour,
  formatWindow,
  isLate,
  lateLabel,
  lateMinutes,
  matchingQueue,
  NO_PICKUP,
  outsideTheCounter,
  pickupTabs,
  queueCounters,
  rowTone,
  sortedQueue,
  stillRemittable,
} from './handover-queue';

/**
 * Les quatre règles de la file, éprouvées hors de tout gabarit :
 *
 * - **une ligne sans créneau ne disparaît pas et n'hérite d'aucune heure** —
 *   c'est le cas de masse depuis le backfill du 2026-08-15 ;
 * - **une borne basse absente s'écrit seule** (`6 h 30`), pas `— – 6 h 30` ;
 * - 🔴 **un créneau `default` n'autorise pas à parler de retard** : c'est
 *   l'ouverture du point, pas une promesse — le calculer dessus allumerait tout
 *   le portefeuille d'un coup ;
 * - **les onglets sont dérivés**, jamais écrits, et aucune ligne ne tombe
 *   hors de tous.
 */

/** Le jour de service de toutes les fixtures. Il n'est comparé qu'à des heures
 *  fournies par le test lui-même — jamais à l'horloge. */
const DAY = '2026-09-10';

function window(over: Partial<HandoverQueueWindowView> = {}): HandoverQueueWindowView {
  return { start: '06:00', end: '08:00', source: 'override', ...over };
}

function entry(over: Partial<HandoverQueueEntryView> = {}): HandoverQueueEntryView {
  return {
    orderId: 'ord_1',
    reference: 'CMD-1042',
    customerLabel: 'Boulangerie Marin',
    tradeName: null,
    pickupLabel: 'Laboratoire',
    fulfillmentMethod: 'pickup',
    window: window(),
    totalUnits: 12,
    placedAt: `${DAY}T05:00:00.000Z`,
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    ...over,
  };
}

describe('pickupTabs', () => {
  it('dérive un onglet par point présent, compté, sans nom écrit en dur', () => {
    const tabs = pickupTabs([
      entry({ orderId: 'a', pickupLabel: 'Val Thorens' }),
      entry({ orderId: 'b', pickupLabel: 'Laboratoire' }),
      entry({ orderId: 'c', pickupLabel: 'Laboratoire' }),
    ]);

    expect(tabs.map((tab) => tab.key)).toEqual(['Laboratoire', 'Val Thorens']);
    expect(tabs.map((tab) => tab.count)).toEqual([2, 1]);
  });

  it('🔴 aucun onglet fourre-tout au-dessus des points', () => {
    // On ne tend pas un sac depuis deux comptoirs à la fois : la personne qui
    // lit cet écran est DANS un point, et la file des autres ne fait
    // qu'allonger la sienne. Le compte de la journée reste dans la bande.
    const tabs = pickupTabs([
      entry({ orderId: 'a', pickupLabel: 'Val Thorens' }),
      entry({ orderId: 'b', pickupLabel: 'Laboratoire' }),
    ]);

    expect(tabs.map((tab) => tab.label)).not.toContain('Tous les points');
  });

  it('les lignes sans point de retrait ont leur onglet — sinon elles seraient hors de tous', () => {
    const tabs = pickupTabs([
      entry({ orderId: 'a' }),
      entry({ orderId: 'b', pickupLabel: null, fulfillmentMethod: 'delivery' }),
    ]);

    expect(tabs.map((tab) => tab.key)).toEqual(['Laboratoire', NO_PICKUP]);
    expect(entriesForTab([entry({ orderId: 'b', pickupLabel: null })], NO_PICKUP)).toHaveLength(1);
  });

  it('aucune ligne ne tombe hors de tous les onglets', () => {
    const entries = [
      entry({ orderId: 'a', pickupLabel: 'Laboratoire' }),
      entry({ orderId: 'b', pickupLabel: null }),
      entry({ orderId: 'c', pickupLabel: '   ' }),
    ];
    const tabs = pickupTabs(entries);

    const seen = new Set(
      tabs.flatMap((tab) => entriesForTab(entries, tab.key).map((row) => row.orderId)),
    );
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('sortedQueue', () => {
  it('ordonne par créneau, puis par heure de commande', () => {
    const rows = sortedQueue([
      entry({ orderId: 'tard', window: window({ start: '09:00', end: '10:00' }) }),
      entry({ orderId: 'tot-2', window: window(), placedAt: `${DAY}T06:00:00.000Z` }),
      entry({ orderId: 'tot-1', window: window(), placedAt: `${DAY}T04:00:00.000Z` }),
    ]);

    expect(rows.map((row) => row.orderId)).toEqual(['tot-1', 'tot-2', 'tard']);
  });

  it('une borne basse absente se range sur sa borne haute, faute d’autre chose', () => {
    const rows = sortedQueue([
      entry({ orderId: 'plage', window: window({ start: '07:00', end: '09:00' }) }),
      entry({ orderId: 'avant', window: window({ start: null, end: '06:30' }) }),
    ]);

    expect(rows.map((row) => row.orderId)).toEqual(['avant', 'plage']);
  });

  it('🔴 une ligne SANS créneau descend en fin de file, sans heure inventée', () => {
    const rows = sortedQueue([
      entry({ orderId: 'sans', window: null }),
      entry({ orderId: 'avec', window: window({ start: '23:00', end: '23:30' }) }),
    ]);

    expect(rows.map((row) => row.orderId)).toEqual(['avec', 'sans']);
    expect(rows[1]?.window).toBeNull();
  });
});

describe('formatWindow', () => {
  it('écrit une tranche complète en heures françaises', () => {
    expect(formatWindow(window({ start: '06:30', end: '08:00' }))).toBe(
      '6\u00a0h\u00a030 – 8\u00a0h\u00a000',
    );
  });

  it('🔴 sans borne basse, rend l’heure SEULE — pas « — – 6 h 30 »', () => {
    const written = formatWindow(window({ start: null, end: '06:30' }));

    expect(written).toBe('6\u00a0h\u00a030');
    expect(written).not.toContain('–');
  });

  it('sans créneau, ne rend rien plutôt qu’une heure', () => {
    expect(formatWindow(null)).toBeNull();
  });

  it('rend telle quelle une valeur qu’elle ne sait pas lire', () => {
    expect(formatHour('bientôt')).toBe('bientôt');
  });
});

describe('isLate', () => {
  const passed = new Date(`${DAY}T09:00:00`);

  it('🔴 ne parle JAMAIS de retard sur un créneau `default`', () => {
    const line = entry({ window: window({ source: 'default', end: '08:00' }) });

    expect(isLate(line, DAY, passed)).toBe(false);
  });

  it('parle de retard sur une tranche réellement demandée et dépassée', () => {
    const line = entry({ window: window({ source: 'override', end: '08:00' }) });

    expect(isLate(line, DAY, passed)).toBe(true);
  });

  it('se tait avant la fin de la tranche', () => {
    const line = entry({ window: window({ source: 'override', end: '08:00' }) });

    expect(isLate(line, DAY, new Date(`${DAY}T07:30:00`))).toBe(false);
  });

  it('se tait sans créneau — il n’y a rien à dépasser', () => {
    expect(isLate(entry({ window: null }), DAY, passed)).toBe(false);
  });

  it('se tait sur une commande remise ou annulée : l’heure ne promet plus rien', () => {
    expect(isLate(entry({ state: 'handed_over' }), DAY, passed)).toBe(false);
    expect(isLate(entry({ state: 'cancelled' }), DAY, passed)).toBe(false);
  });
});

describe('rowTone', () => {
  it('l’annulation gagne sur le retard', () => {
    const line = entry({
      state: 'cancelled',
      window: window({ source: 'override', end: '08:00' }),
    });

    expect(rowTone(line, DAY, new Date(`${DAY}T09:00:00`))).toBe('alert');
  });

  it('une ligne ordinaire ne porte aucun ton', () => {
    expect(rowTone(entry({ window: null }), DAY, new Date(`${DAY}T09:00:00`))).toBeNull();
  });
});

describe('lateMinutes', () => {
  it('chiffre le dépassement de la borne haute', () => {
    const line = entry({ window: window({ source: 'override', end: '08:00' }) });

    expect(lateMinutes(line, DAY, new Date(`${DAY}T08:56:00`))).toBe(56);
  });

  it('🔴 se tait partout où `isLate` se tait — il ne rejuge rien', () => {
    const byDefault = entry({ window: window({ source: 'default', end: '08:00' }) });
    const done = entry({ state: 'handed_over', window: window({ source: 'override' }) });

    expect(lateMinutes(byDefault, DAY, new Date(`${DAY}T23:00:00`))).toBeNull();
    expect(lateMinutes(done, DAY, new Date(`${DAY}T23:00:00`))).toBeNull();
    expect(lateMinutes(entry({ window: null }), DAY, new Date(`${DAY}T23:00:00`))).toBeNull();
  });
});

describe('lateLabel', () => {
  it('compte en minutes sous l’heure', () => {
    expect(lateLabel(1)).toBe('1\u00a0min de retard');
    expect(lateLabel(59)).toBe('59\u00a0min de retard');
  });

  /**
   * 🔴 Au-delà de soixante, les minutes cessent d'être une durée qu'on se
   * représente : « 143 min » se convertit de tête au comptoir, et c'est
   * exactement le travail qu'un écran doit prendre.
   */
  it('bascule à l’heure dès soixante', () => {
    expect(lateLabel(60)).toBe('1\u00a0h de retard');
    expect(lateLabel(80)).toBe('1\u00a0h\u00a020 de retard');
    expect(lateLabel(125)).toBe('2\u00a0h\u00a005 de retard');
  });
});

describe('queueCounters', () => {
  const at = new Date(`${DAY}T09:00:00`);

  it('sépare ce qui est parti, ce qui attend, et ce qui est en retard', () => {
    const lines = [
      entry({ orderId: 'a', state: 'handed_over' }),
      entry({ orderId: 'b', state: 'cancelled' }),
      entry({ orderId: 'c', state: 'ready', window: window({ source: 'override', end: '08:00' }) }),
      entry({ orderId: 'd', state: 'expected', window: null }),
    ];

    expect(queueCounters(lines, DAY, at)).toEqual({
      total: 4,
      handedOver: 1,
      late: 1,
      // 🔴 Ni les remises, ni les annulées : « en attente » est ce qu'il reste
      // à TENDRE, pas ce qui reste dans la liste.
      waiting: 2,
    });
  });

  it('une journée vide compte zéro partout', () => {
    expect(queueCounters([], DAY, at)).toEqual({ total: 0, handedOver: 0, late: 0, waiting: 0 });
  });
});

describe('clockOf', () => {
  it('rend l’heure LOCALE, sur deux chiffres', () => {
    expect(clockOf(new Date(`${DAY}T06:41:00`))).toBe('06:41');
  });
});

describe('atTheCounter', () => {
  it('🔴 écarte les LIVRAISONS, et elles seules', () => {
    const kept = atTheCounter([
      entry({ orderId: 'a', fulfillmentMethod: 'pickup' }),
      entry({ orderId: 'b', fulfillmentMethod: 'delivery' }),
    ]);

    expect(kept.map((row) => row.orderId)).toEqual(['a']);
  });

  it('🔴 un RETRAIT sans point de retrait reste dans la file', () => {
    // Régression de conception : le critère a failli être `pickupLabel === null`,
    // qui confond deux choses — une livraison n'a pas de point, mais une
    // commande antérieure aux points de retrait non plus, et elle se remet bien
    // en boutique. Couper là l'aurait fait disparaître de TOUS les écrans.
    const kept = atTheCounter([entry({ fulfillmentMethod: 'pickup', pickupLabel: null })]);

    expect(kept).toHaveLength(1);
  });
});

describe('matchingQueue', () => {
  it('un terme vide ne filtre rien', () => {
    const all = [entry({ orderId: 'a' }), entry({ orderId: 'b' })];

    expect(matchingQueue(all, '   ')).toHaveLength(2);
  });

  it('trouve par le client, la référence et l’enseigne', () => {
    const rows = [
      entry({ orderId: 'a', customerLabel: 'Boulangerie Marin' }),
      entry({ orderId: 'b', customerLabel: 'Hôtel des Cimes', reference: 'ORD-ZZZ' }),
      entry({ orderId: 'c', customerLabel: 'SAS Tommeuses', tradeName: 'La Folie Douce' }),
    ];

    expect(matchingQueue(rows, 'marin').map((row) => row.orderId)).toEqual(['a']);
    expect(matchingQueue(rows, 'ord-zzz').map((row) => row.orderId)).toEqual(['b']);
    expect(matchingQueue(rows, 'folie').map((row) => row.orderId)).toEqual(['c']);
  });

  it('🔴 ignore la casse ET les accents : le comptoir tape vite', () => {
    const rows = [entry({ customerLabel: 'Hôtel des Cimes' })];

    expect(matchingQueue(rows, 'hotel')).toHaveLength(1);
  });

  it('🔴 trouve un CRÉNEAU tapé avec des espaces ordinaires', () => {
    // Régression vue à l'écran (2026-09-11) : `formatWindow` compose ses heures
    // avec des espaces INSÉCABLES — « 14 h 00 » — et personne n'en tape une.
    // Sans le pli des espaces, chercher un créneau ne rendait jamais rien, et
    // la file paraissait vide au lieu de paraître mal cherchée.
    const rows = [entry({ window: { start: '14:00', end: '15:00', source: 'override' } })];

    expect(matchingQueue(rows, '14 h')).toHaveLength(1);
  });

  it('ne cherche PAS dans l’identifiant technique', () => {
    // Une correspondance que rien à l'écran n'explique est pire qu'aucune.
    const rows = [entry({ orderId: 'ord_secret_42' })];

    expect(matchingQueue(rows, 'secret')).toHaveLength(0);
  });
});

/**
 * **`true` seulement si `TValue` n'appartient PAS à `TUnion`.**
 *
 * 🔴 Le seul moyen d'éprouver un rétrécissement de type sans directive : la
 * porte `no-type-escapes` refuse `@ts-expect-error` comme les autres, et elle a
 * raison — une directive se relit mal et s'oublie. Ici le compilateur fait le
 * travail : si le champ redevenait `string`, `'overide' extends string` serait
 * vrai, le type vaudrait `false`, et `const … : false = true` refuserait de
 * compiler. Le cas échoue alors AVANT de tourner.
 */
type Rejects<TUnion, TValue> = TValue extends TUnion ? false : true;

describe("le type ferme ce qu'une chaîne laissait ouvert", () => {
  /**
   * 🔴 Ces cas n'éprouvent pas un comportement, ils éprouvent le COMPILATEUR.
   *
   * `source` et `fulfillmentMethod` traversaient le contrat en `string` alors
   * que leurs unions existaient déjà dans le même paquet, trois fichiers plus
   * loin. Ce que ça coûtait : `isLate` compare `source` au littéral
   * `'override'`, et une faute de frappe inversait la condition sur toute la
   * file — le backfill du 2026-08-15 ayant posé un `default` sur l'intégralité
   * des commandes antérieures, l'écran aurait annoncé « en retard » sur tout le
   * portefeuille.
   *
   * Aucun test de comportement ne l'aurait vue : les fixtures écrivent le même
   * littéral que le code, donc une faute des DEUX côtés reste verte. Seul le
   * type ne peut pas se tromper des deux côtés.
   */
  it('🔴 une provenance inventée ne compile pas', () => {
    const rejected: Rejects<FulfillmentSource, 'overide'> = true;
    const accepted: Rejects<FulfillmentSource, 'override'> = false;

    expect([rejected, accepted]).toEqual([true, false]);
  });

  it('🔴 un acheminement inventé ne compile pas', () => {
    // `atTheCounter` écarte `'delivery'` ; une troisième valeur passerait
    // silencieusement au comptoir.
    const rejected: Rejects<FulfillmentMethod, 'coursier'> = true;

    expect(rejected).toBe(true);
  });

  it('🔴 une attestation inventée ne compile pas', () => {
    // Une remise saisie présentée comme autre chose que `manual` serait fausse,
    // pas faible. Le type l'interdit.
    const rejected: Rejects<HandoverVia, 'presume'> = true;

    expect(rejected).toBe(true);
  });
});

describe('outsideTheCounter', () => {
  const subject = (
    over: Partial<Pick<OrderHandoverView, 'fulfillmentMethod' | 'pickupLabel'>> = {},
  ): Pick<OrderHandoverView, 'fulfillmentMethod' | 'pickupLabel'> => ({
    fulfillmentMethod: 'pickup',
    pickupLabel: 'Le Labo',
    ...over,
  });

  it('ne dit rien quand le code désigne une commande du point ouvert', () => {
    expect(outsideTheCounter(subject(), 'Le Labo')).toBeNull();
  });

  it('🔴 nomme les DEUX points quand le client s’est trompé d’adresse', () => {
    // Le cas de flux que la revue a relevé : l'en-tête dit « Le Labo », les
    // trois compteurs disent « Le Labo », et le scan remettait un sac du
    // Village sans qu'une ligne de l'écran ne l'ait jamais montré.
    const notice = outsideTheCounter(subject({ pickupLabel: 'Le Village' }), 'Le Labo');

    expect(notice).toContain('Le Village');
    expect(notice).toContain('Le Labo');
  });

  it('🔴 annonce une livraison, quel que soit l’onglet ouvert', () => {
    // `atTheCounter` les a retirées de la file : ce code n'a AUCUNE ligne à
    // l'écran, et c'est la seule façon de le dire à qui se présente.
    for (const tab of ['Le Labo', NO_PICKUP, '']) {
      expect(outsideTheCounter(subject({ fulfillmentMethod: 'delivery' }), tab)).toContain(
        'livraison',
      );
    }
  });

  it('🔴 se tait quand l’écran n’affirme AUCUN périmètre', () => {
    // Pas d'onglet, pas de promesse : il n'y a rien à démentir, et une phrase
    // ici se lirait comme un reproche sans objet.
    expect(outsideTheCounter(subject({ pickupLabel: 'Le Village' }), '')).toBeNull();
  });

  it('🔴 une commande SANS point est chez elle sous l’onglet qui les rassemble', () => {
    // Régression de conception : ces commandes sont antérieures aux points de
    // retrait et se remettent bien en boutique — c'est tout l'objet de
    // l'onglet « Sans point de retrait ». Les signaler l'aurait contredit.
    expect(outsideTheCounter(subject({ pickupLabel: null }), NO_PICKUP)).toBeNull();
    expect(outsideTheCounter(subject({ pickupLabel: '  ' }), NO_PICKUP)).toBeNull();
  });

  it('nomme l’onglet ouvert quand la commande ne porte aucun point', () => {
    expect(outsideTheCounter(subject({ pickupLabel: null }), 'Le Labo')).toContain('Le Labo');
  });

  it('signale une commande à point sous l’onglet des sans-point', () => {
    expect(outsideTheCounter(subject(), NO_PICKUP)).toContain('Le Labo');
  });
});
describe('stillRemittable', () => {
  it('un sac déjà parti ne se retend pas, une commande annulée non plus', () => {
    expect(stillRemittable('handed_over')).toBe(false);
    expect(stillRemittable('cancelled')).toBe(false);
  });

  it('🔴 une commande que le fournil n’a pas déclarée prête reste remettable', () => {
    // Même permissivité que `handoverBlocker` côté serveur, et pour la même
    // raison : renvoyer un client physiquement là, colis prêt, parce qu'un
    // écran d'atelier n'a pas été cliqué serait pire que tout.
    expect(stillRemittable('expected')).toBe(true);
    expect(stillRemittable('ready')).toBe(true);
  });

  /**
   * 🔴 **Le cas qui justifie que la règle ait déménagé** (revue du 2026-09-11,
   * point 4). Elle était écrite à l'identique dans `queue-table.ts` et
   * `handover-detail.ts` ; le coût n'était pas la duplication mais le jour où
   * un CINQUIÈME état apparaît et où un seul des deux fichiers est touché — la
   * file offrirait alors un geste que le rail refuse, sur la même ligne.
   *
   * Ce cas ne teste pas un comportement : il fait constater l'élargissement de
   * l'ensemble au COMPILATEUR. Un membre de plus rend `[HandoverQueueState]
   * extends [les quatre]` faux, donc `false` n'est plus assignable à `true`, et
   * `tsc` refuse (TS2322) — ce qu'aucun `default:` silencieux n'aurait dit.
   */
  it('🔴 un cinquième état ne s’ajoute pas sans qu’on relise cette règle', () => {
    type Covers<TUnion, TKnown> = [TUnion] extends [TKnown] ? true : false;
    const covered: Covers<HandoverQueueState, 'handed_over' | 'ready' | 'expected' | 'cancelled'> =
      true;

    expect(covered).toBe(true);
  });
});
