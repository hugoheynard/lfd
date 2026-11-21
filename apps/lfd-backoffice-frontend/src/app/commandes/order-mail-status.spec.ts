import { describe, expect, it } from 'vitest';

import { orderMailStatus } from './order-mail-status';

describe('orderMailStatus — l’étape d’un e-mail, en mots simples', () => {
  it('dit l’étape d’envoi tant que le destinataire n’a rien dit', () => {
    expect(orderMailStatus({ state: 'requested', delivery: null }).label).toBe('Demandé');
    expect(orderMailStatus({ state: 'sending', delivery: null }).label).toBe('Envoi en cours');
    // Accepté n'est pas remis : l'étape reste celle de l'envoi.
    expect(orderMailStatus({ state: 'accepted', delivery: null }).label).toBe(
      'Accepté par l’envoi',
    );
  });

  it('dit le retour du destinataire quand il est connu', () => {
    expect(orderMailStatus({ state: 'accepted', delivery: 'delivered' }).label).toBe('Remis');
    expect(orderMailStatus({ state: 'accepted', delivery: 'bounced' }).label).toBe('Rebond');
    expect(orderMailStatus({ state: 'accepted', delivery: 'delayed' }).label).toBe(
      'Remise retardée',
    );
  });

  it('dit le mode dev comme tel, sans jargon', () => {
    const status = orderMailStatus({ state: 'accepted', delivery: 'dry_run' });
    expect(status.label).toBe('Non envoyé — mode dev');
    expect(status.label).not.toMatch(/Resend|blanc/u);
  });

  it('un échec d’envoi l’emporte', () => {
    expect(orderMailStatus({ state: 'failed', delivery: null })).toEqual({
      label: 'Échec de l’envoi',
      tone: 'alert',
    });
  });
});
