import { describe, expect, it } from 'vitest';

import { requestedTab } from './procedure-tab-param';

describe('le paramètre `?onglet=` du détail d’une procédure', () => {
  it('traduit les cinq valeurs de la barre d’adresse', () => {
    expect(requestedTab('comptes')).toBe('accounts');
    expect(requestedTab('mandats')).toBe('mandates');
    expect(requestedTab('factures')).toBe('invoices');
    expect(requestedTab('fichier')).toBe('file');
    expect(requestedTab('retours')).toBe('returns');
  });

  it('absent ou inconnu : le serveur choisit', () => {
    expect(requestedTab(null)).toBeNull();
    expect(requestedTab('accounts')).toBeNull();
    expect(requestedTab('toString')).toBeNull();
  });
});
