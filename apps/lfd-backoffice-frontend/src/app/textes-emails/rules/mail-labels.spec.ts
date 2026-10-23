import { describe, expect, it } from 'vitest';

import { mailLabel, mailWhoAndWhen, pathLabel } from './mail-labels';

describe('mailLabel — l’intitulé lisible d’un e-mail', () => {
  it('nomme un e-mail du registre en français', () => {
    expect(mailLabel('customer.order-placed').title).toBe('Commande passée');
    expect(mailWhoAndWhen('customer.order-placed')).toBe('Le client, quand il passe sa commande');
  });

  it('garde la clé pour un e-mail que l’écran ne connaît pas encore', () => {
    expect(mailLabel('customer.inconnu').title).toBe('customer.inconnu');
    expect(mailWhoAndWhen('customer.inconnu')).toBe('');
  });
});

describe('pathLabel — le nom d’un texte dans son e-mail', () => {
  it('reconnaît la partie de l’e-mail à la tête du chemin', () => {
    expect(pathLabel('subject')).toBe('Objet');
    expect(pathLabel('title.paid')).toBe('Titre — paid');
  });

  it('montre le chemin tel quel sinon', () => {
    expect(pathLabel('totalLabel.due')).toBe('totalLabel.due');
  });
});
