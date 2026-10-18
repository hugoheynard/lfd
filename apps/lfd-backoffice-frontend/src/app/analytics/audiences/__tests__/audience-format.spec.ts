import { describe, expect, it } from 'vitest';

import {
  anonymityHelp,
  audiencePeriodOf,
  audienceRowOf,
  AUDIENCE_PERIOD_OPTIONS,
  DIMENSION_TEXTS,
  TOO_FEW_CLIENTS,
} from '../audience-format';

describe('la mise en mots des audiences', () => {
  it('propose 7, 30 et 90 jours, et refuse une autre période', () => {
    expect(AUDIENCE_PERIOD_OPTIONS.map((option) => option.value)).toEqual(['7', '30', '90']);
    expect(audiencePeriodOf('90')).toBe(90);
    expect(audiencePeriodOf('14')).toBeNull();
  });

  it('annonce le profil de séjour comme une ESTIMATION, avec sa règle (A3)', () => {
    const text = DIMENSION_TEXTS.stay_profile;
    expect(text.title).toBe('Profil de séjour (estimé)');
    expect(text.subtitle).toContain('Estimé, jamais déclaré');
    expect(text.subtitle).toContain('10 jours');
    expect(text.subtitle).toContain('3 semaines');
  });

  it('nomme la coupe de la langue de la commande (A3)', () => {
    expect(DIMENSION_TEXTS.order_locale.title).toBe('Langue de la commande');
  });

  it('dit le seuil que le serveur applique', () => {
    expect(anonymityHelp(5)).toContain('moins de 5 clients distincts');
  });

  it('écrit une case masquée « trop peu de clients », et des tirets ailleurs', () => {
    expect(
      audienceRowOf({ status: 'too_few_clients', key: 'pro', label: 'Professionnels' }),
    ).toEqual({
      key: 'pro',
      label: 'Professionnels',
      masked: true,
      clients: TOO_FEW_CLIENTS,
      orders: '—',
      averageBasket: '—',
      revenue: '—',
      topFamilies: '—',
    });
  });

  it('écrit une case montrée en euros, HT puis TTC, et ses familles en tête', () => {
    const row = audienceRowOf({
      status: 'shown',
      key: 'public',
      label: 'Particuliers',
      clients: 6,
      orders: 9,
      revenueHtCents: 2_160,
      revenueTtcCents: 2_277,
      averageBasketHtCents: 240,
      averageBasketTtcCents: 253,
      topFamilies: [
        { familyId: 'fam-pains', name: 'Pains', revenueHtCents: 2_000 },
        { familyId: null, name: 'Famille inconnue', revenueHtCents: 160 },
      ],
    });
    expect(row.masked).toBe(false);
    expect(row.clients).toBe('6');
    expect(row.averageBasket.replace(/\s/gu, ' ')).toBe('2,40 € HT · 2,53 € TTC');
    expect(row.revenue.replace(/\s/gu, ' ')).toBe('21,60 € HT · 22,77 € TTC');
    expect(row.topFamilies).toBe('Pains, Famille inconnue');
  });
});
