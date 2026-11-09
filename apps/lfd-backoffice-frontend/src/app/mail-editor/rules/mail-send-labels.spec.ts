import { describe, expect, it } from 'vitest';

import {
  mailDeliveryKindLabel,
  mailSendBadge,
  mailSendQuery,
  NO_MAIL_SEND_FILTERS,
} from './mail-send-labels';

describe('mailSendBadge — la pastille d’un envoi', () => {
  it('dit l’état seul quand rien n’est revenu du fournisseur', () => {
    expect(mailSendBadge({ state: 'accepted', delivery: null })).toEqual({
      label: 'Accepté par Resend',
      tone: 'info',
    });
  });

  it('ajoute le retour, au ton du retour', () => {
    expect(mailSendBadge({ state: 'accepted', delivery: 'bounced' })).toEqual({
      label: 'Accepté par Resend · Rebondi',
      tone: 'alert',
    });
    expect(mailSendBadge({ state: 'accepted', delivery: 'delivered' }).tone).toBe('success');
  });

  it('un échec de notre côté l’emporte sur le retour', () => {
    expect(mailSendBadge({ state: 'failed', delivery: 'delivered' }).tone).toBe('alert');
  });

  it('le mode à blanc ne se confond pas avec « rien reçu »', () => {
    expect(mailSendBadge({ state: 'accepted', delivery: 'dry_run' }).label).toContain('À blanc');
  });
});

describe('mailSendBadge — un refus d’e-mail marketing (U4)', () => {
  it('dit la raison fermée en toutes lettres', () => {
    expect(
      mailSendBadge({ state: 'refused', delivery: null, refusalCode: 'unsubscribed' }),
    ).toEqual({ label: 'Non envoyé : désinscrit', tone: 'warning' });
    expect(
      mailSendBadge({ state: 'refused', delivery: null, refusalCode: 'no_consent' }).label,
    ).toBe('Non envoyé : sans consentement');
  });

  it('un autre refus garde son libellé d’état', () => {
    expect(mailSendBadge({ state: 'refused', delivery: null, refusalCode: null }).label).toBe(
      'Refusé',
    );
  });
});

describe('mailDeliveryKindLabel', () => {
  it('traduit le genre et garde le sous-genre', () => {
    expect(mailDeliveryKindLabel('Permanent/Suppressed')).toBe('Définitif (Suppressed)');
    expect(mailDeliveryKindLabel('Transient')).toBe('Passager');
    expect(mailDeliveryKindLabel('Autre/X')).toBe('Autre (X)');
  });
});

describe('mailSendQuery — les paramètres de la liste', () => {
  it('ne pose que les critères choisis, la portée toujours', () => {
    expect(mailSendQuery(NO_MAIL_SEND_FILTERS, null)).toEqual({ scope: 'regular' });
  });

  it('borne la période du minuit du premier jour au minuit qui suit le dernier', () => {
    const params = mailSendQuery(
      { ...NO_MAIL_SEND_FILTERS, from: '2026-11-01', to: '2026-11-02' },
      'c',
    );
    expect(params['from']).toBe(new Date(2026, 10, 1).toISOString());
    expect(params['to']).toBe(new Date(2026, 10, 3).toISOString());
    expect(params['cursor']).toBe('c');
  });

  it('pose la raison d’un refus quand elle est choisie (U4)', () => {
    expect(mailSendQuery({ ...NO_MAIL_SEND_FILTERS, refusal: 'unsubscribed' }, null)).toEqual({
      scope: 'regular',
      refusal: 'unsubscribed',
    });
  });

  it('écarte un jour mal formé plutôt que d’envoyer un instant faux', () => {
    expect(mailSendQuery({ ...NO_MAIL_SEND_FILTERS, from: 'hier' }, null)['from']).toBeUndefined();
  });
});
