import type {
  DossierDispatchView,
  PlanVersionCause,
  PlanVersionMarkView,
  PlanVersionShipmentRef,
  PlanVersionView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  authorLabel,
  causeLabel,
  changeSentence,
  dispatchNeedsAttention,
  dispatchStandingLabel,
  dispatchStandingOf,
  markAuthor,
  paperLabel,
  paperStateOf,
  parisTime,
  resupplySentence,
  signedDelta,
  toCheckSentence,
  versionTitle,
  withAuthor,
} from './plan-version-wording';

/**
 * **Les phrases des versions du plan** — chaque cause, chaque auteur, chaque
 * genre de changement. Les instants ne sont comparés à aucune horloge : ils
 * peuvent rester absolus (CLAUDE.md § 5).
 */

/** 18 h 10 UTC, en hiver : 19 h 10 à Paris. */
const RETAKEN_AT = '2026-11-27T18:10:00.000Z';

const MARK: PlanVersionMarkView = {
  version: 3,
  cause: 'retaken',
  recordedAt: RETAKEN_AT,
  recordedBy: { kind: 'staff', staffId: 'stf_marie', name: 'Marie' },
  closedAt: '2026-11-27T16:00:00.000Z',
};

const ORD_42: PlanVersionShipmentRef = {
  orderId: 'ord_42',
  rank: 1,
  reference: 'ORD-0042',
  customerLabel: 'Café des Halles',
};

describe('la cause d’une version', () => {
  it.each<[PlanVersionCause, string]>([
    ['closed', 'Arrêt'],
    ['auto_closed', 'Arrêt automatique'],
    ['retaken', 'Retirage'],
    ['order_revised', 'Commande révisée'],
    ['order_withdrawn', 'Commande annulée'],
    ['resupply_launched', 'Réassort lancé'],
    ['opened_by_resupply', 'Journée ouverte par un réassort'],
  ])('%s se dit « %s »', (cause, label) => {
    expect(causeLabel(cause)).toBe(label);
  });
});

describe('l’auteur', () => {
  it('nomme le staff', () => {
    expect(authorLabel({ kind: 'staff', staffId: 's', name: 'Marie' })).toBe('Marie');
  });

  it('dit « l’équipe » quand le nom manque', () => {
    expect(authorLabel({ kind: 'staff', staffId: 's', name: null })).toBe('l’équipe');
  });

  it('dit « le client » pour un client ou un invité', () => {
    expect(authorLabel({ kind: 'customer' })).toBe('le client');
    expect(authorLabel({ kind: 'guest' })).toBe('le client');
  });

  it('dit « automatique » pour le système', () => {
    expect(authorLabel({ kind: 'system' })).toBe('automatique');
  });

  it('relit le nom dans la liste par numéro de version, la marque sinon', () => {
    const anonymous: PlanVersionMarkView = {
      ...MARK,
      recordedBy: { kind: 'staff', staffId: 'stf_marie', name: null },
    };
    expect(
      markAuthor(anonymous, [
        { version: 3, author: { kind: 'staff', staffId: 'stf_marie', name: 'Marie' } },
      ]),
    ).toBe('Marie');
    expect(markAuthor(anonymous, [])).toBe('l’équipe');
  });
});

describe('le titre, l’heure et l’écart', () => {
  it('dit la version et son tirage', () => {
    expect(versionTitle({ version: 4, printRun: 1 })).toBe('Version 4 · tirage 1');
  });

  it('dit l’heure de Paris', () => {
    expect(parisTime(RETAKEN_AT)).toBe('19 h 10');
  });

  it('signe l’écart, en pièces ou en grammes', () => {
    expect(signedDelta(15, 'piece')).toBe('+15');
    expect(signedDelta(-250, 'weight')).toBe('−250 g');
    expect(signedDelta(0, 'piece')).toBe('0');
  });
});

describe('le papier', () => {
  const paper = (
    version: number,
    paperVersion: number | null,
    dossier: boolean | null,
  ): Pick<PlanVersionView, 'version' | 'paper'> => ({
    version,
    paper: { version: paperVersion, dossier, count: dossier },
  });

  it('rangé, non rangé, ou le stockage muet', () => {
    expect(paperStateOf(paper(2, 2, true))).toEqual({ kind: 'stored' });
    expect(paperLabel(paperStateOf(paper(2, 2, false)))).toBe('Papier non rangé');
    expect(paperLabel(paperStateOf(paper(2, 2, null)))).toBe(
      'Papier : le stockage n’a pas répondu',
    );
  });

  it('renvoie un retrait au papier de la version d’avant', () => {
    expect(paperLabel(paperStateOf(paper(3, 2, true)))).toBe('Même papier que la version 2');
  });

  it('dit qu’il n’y a aucun papier', () => {
    expect(paperLabel(paperStateOf(paper(1, null, null)))).toBe('Aucun papier');
  });
});

describe('les changements expliqués', () => {
  const entered = (
    reason:
      | 'arrested'
      | 'retaken'
      | 'retaken_off_plan'
      | 'rearrested'
      | 'rearrested_off_plan'
      | 'unknown',
  ) =>
    changeSentence({
      kind: 'entered',
      shipment: ORD_42,
      by: MARK,
      entry: 'retaken',
      offPlan: true,
      reason,
    });

  it.each([
    ['arrested', 'ORD-0042 au plan dès l’arrêt'],
    ['retaken', 'ORD-0042 intégrée au retirage de 19 h 10'],
    ['retaken_off_plan', 'ORD-0042 hors plan, intégrée au retirage de 19 h 10'],
    ['rearrested', 'ORD-0042 refigée après réouverture'],
    ['rearrested_off_plan', 'ORD-0042 refigée après réouverture (reçue hors plan)'],
    ['unknown', 'ORD-0042 entrée au plan, sans trace de la façon'],
  ] as const)('une entrée %s', (reason, sentence) => {
    expect(entered(reason)).toBe(sentence);
  });

  const lines = [
    { sku: 'CRO', productName: 'Croissant', saleUnit: 'piece' as const, before: 10, after: 15 },
  ];

  it('une révision', () => {
    expect(
      changeSentence({
        kind: 'revised',
        shipment: { ...ORD_42, reference: 'ORD-0031' },
        by: MARK,
        lines,
      }),
    ).toBe('ORD-0031 révisée : Croissant 10 → 15');
  });

  it('une modification pendant la réouverture', () => {
    expect(
      changeSentence({ kind: 'modified_during_reopen', shipment: ORD_42, by: MARK, lines }),
    ).toBe('ORD-0042 modifiée pendant la réouverture : Croissant 10 → 15');
  });

  it('des lignes changées par un autre geste, en grammes', () => {
    expect(
      changeSentence({
        kind: 'lines_changed',
        shipment: ORD_42,
        by: MARK,
        lines: [
          { sku: 'SAU', productName: 'Saumon', saleUnit: 'weight', before: 500, after: 1250 },
        ],
      }),
    ).toBe('ORD-0042 changée : Saumon 500 g → 1,25 kg');
  });

  it('une annulée après l’arrêt, toujours produite', () => {
    expect(
      changeSentence({
        kind: 'withdrawn',
        shipment: { ...ORD_42, reference: 'ORD-0027' },
        by: MARK,
        withdrawnAt: RETAKEN_AT,
        withdrawnBy: null,
      }),
    ).toBe('ORD-0027 annulée après l’arrêt — toujours produite');
  });

  it('une retirée que le nouvel arrêt écarte, sans référence connue', () => {
    expect(
      changeSentence({
        kind: 'left_after_withdrawal',
        shipment: { orderId: 'ord_x', rank: 2, reference: null, customerLabel: null },
        by: MARK,
      }),
    ).toBe('Une commande retirée (envoi 2) annulée, sortie du plan au nouvel arrêt');
  });

  it('ajoute l’auteur entre parenthèses', () => {
    expect(withAuthor(entered('retaken_off_plan'), 'Marie')).toBe(
      'ORD-0042 hors plan, intégrée au retirage de 19 h 10 (Marie)',
    );
  });

  it.each([
    ['launched', 'réassort Village lancé'],
    ['entered', 'réassort Village entré au plan'],
    ['left', 'réassort Village sorti du plan'],
  ] as const)('un réassort %s', (kind, sentence) => {
    expect(
      resupplySentence({ kind, resupplyId: 'rs_1', siteLabel: 'Village', name: null, by: MARK }),
    ).toBe(sentence);
  });

  it('nomme le réassort quand il a un nom', () => {
    expect(
      resupplySentence({
        kind: 'launched',
        resupplyId: 'rs_1',
        siteLabel: 'Village',
        name: 'Vitrine du matin',
        by: MARK,
      }),
    ).toBe('réassort Village (Vitrine du matin) lancé');
  });

  it('dit une sortie inexpliquée sans accuser', () => {
    expect(
      toCheckSentence({
        kind: 'left_reason_at_commerce',
        severity: 'to_check',
        shipment: ORD_42,
        by: MARK,
      }),
    ).toBe('ORD-0042 sortie du plan, raison au commerce');
  });
});

describe('ce qu’a reçu un destinataire', () => {
  const dispatch = (planVersion: number | null | 'none'): DossierDispatchView => ({
    recipientId: 'r1',
    name: 'Fournil',
    lastReceived: planVersion === 'none' ? null : { at: RETAKEN_AT, planVersion },
    lastAttempt: null,
  });

  it('la version courante ne se signale pas', () => {
    const standing = dispatchStandingOf(dispatch(4), 4);
    expect(dispatchStandingLabel(standing)).toBe('A reçu la version 4, la courante');
    expect(dispatchNeedsAttention(standing)).toBe(false);
  });

  it('une version dépassée se signale', () => {
    const standing = dispatchStandingOf(dispatch(2), 4);
    expect(dispatchStandingLabel(standing)).toBe('A reçu la version 2 — dépassée');
    expect(dispatchNeedsAttention(standing)).toBe(true);
  });

  it('un envoi d’avant les versions, ou rien reçu, se signale', () => {
    expect(dispatchStandingLabel(dispatchStandingOf(dispatch(null), 4))).toBe(
      'A reçu un dossier d’avant les versions',
    );
    const nothing = dispatchStandingOf(dispatch('none'), 4);
    expect(dispatchStandingLabel(nothing)).toBe('N’a encore rien reçu de cette journée');
    expect(dispatchNeedsAttention(nothing)).toBe(true);
  });
});
