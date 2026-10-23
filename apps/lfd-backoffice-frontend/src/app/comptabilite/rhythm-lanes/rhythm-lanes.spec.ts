import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { BillingRhythmsCalendarView } from '@lfd/contracts';

import { RhythmLanes } from './rhythm-lanes';

/**
 * Les jours ci-dessous sont ceux que le serveur rendrait ; ils ne sont comparés
 * qu'entre eux, jamais à l'horloge (règle des dates de fixture). L'axe fait 42
 * jours, du lundi 5 octobre au dimanche 15 novembre inclus.
 */
function calendar(over: Partial<BillingRhythmsCalendarView> = {}): BillingRhythmsCalendarView {
  return {
    legalEntityId: 'le1',
    today: '2026-10-08',
    startsOn: '2026-10-05',
    endsOn: '2026-11-16',
    preNotificationDays: 14,
    rhythms: [
      {
        mode: 'weekly',
        followed: true,
        payerCount: 2,
        periods: [
          {
            closesAt: '2026-10-11T22:00:00.000Z',
            invoicedOn: '2026-10-11',
            noticeOn: '2026-10-12',
            collectionDay: '2026-10-26',
            depositDeadline: { day: '2026-10-22', time: '16:00' },
            batchId: 'b_weekly',
          },
        ],
      },
      { mode: 'semimonthly', followed: false, payerCount: 0, periods: [] },
      {
        mode: 'monthly',
        followed: true,
        payerCount: 0,
        periods: [
          {
            // Clôture passée : seule son échéance tombe sur l'axe.
            closesAt: '2026-09-30T22:00:00.000Z',
            invoicedOn: '2026-09-30',
            noticeOn: '2026-10-01',
            collectionDay: '2026-10-15',
            depositDeadline: { day: '2026-10-13', time: '16:00' },
            batchId: null,
          },
          {
            closesAt: '2026-10-31T23:00:00.000Z',
            invoicedOn: '2026-10-31',
            noticeOn: '2026-11-01',
            // Hors de l'axe : la marque tombe, la phrase reste.
            collectionDay: '2026-11-16',
            depositDeadline: { day: '2026-11-12', time: '16:00' },
            batchId: null,
          },
        ],
      },
    ],
    ...over,
  };
}

async function render(view: BillingRhythmsCalendarView): Promise<ComponentFixture<RhythmLanes>> {
  TestBed.configureTestingModule({ imports: [RhythmLanes], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(RhythmLanes);
  fixture.componentRef.setInput('calendar', view);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<RhythmLanes>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const marks = (fixture: ComponentFixture<RhythmLanes>, row: number): HTMLElement[] => {
  const track = root(fixture).querySelectorAll('.lanes-track')[row];
  return [...(track?.querySelectorAll<HTMLElement>('.lanes-mark') ?? [])];
};

describe('RhythmLanes', () => {
  it('trois barres, dans l’ordre du serveur, chacune nommée', async () => {
    const fixture = await render(calendar());
    const names = [...root(fixture).querySelectorAll('.lanes-name strong')].map(
      (name) => name.textContent,
    );

    expect(names).toEqual(['Hebdomadaire', 'Deux fois par mois', 'Mensuel']);
  });

  it('met en évidence les rythmes suivis, et dit qui les suit', async () => {
    const fixture = await render(calendar());
    const tracks = [...root(fixture).querySelectorAll('.lanes-track')];

    expect(tracks.map((track) => track.classList.contains('is-followed'))).toEqual([
      true,
      false,
      true,
    ]);
    expect(root(fixture).textContent).toContain('2 clients');
    expect(root(fixture).textContent).toContain('Aucun client');
    expect(root(fixture).textContent).toContain('Par défaut · 0 client');
  });

  it('le mensuel dit aussi combien de clients le suivent, au bon nombre', async () => {
    const badgeOf = async (payerCount: number): Promise<string> => {
      const base = calendar();
      const fixture = await render(
        calendar({
          rhythms: base.rhythms.map((lane) =>
            lane.mode === 'monthly' ? { ...lane, payerCount } : lane,
          ),
        }),
      );
      TestBed.resetTestingModule();
      return root(fixture).querySelectorAll('.lanes-name')[2]?.textContent ?? '';
    };

    expect(await badgeOf(1)).toContain('Par défaut · 1 client');
    expect(await badgeOf(1)).not.toContain('1 clients');
    expect(await badgeOf(5)).toContain('Par défaut · 5 clients');
  });

  it('pose les quatre jalons aux jours servis, et date chacun en toutes lettres', async () => {
    const fixture = await render(calendar());
    const weekly = marks(fixture, 0);

    expect(weekly.map((mark) => mark.dataset['kind'])).toEqual([
      'closure',
      'notice',
      'deposit',
      'collection',
    ]);
    // Clôture au bord du 12 (7 jours sur 42), dépôt le 22 à 16h (17 + 2/3),
    // échéance au milieu du 26 (21,5 / 42).
    expect(Number.parseFloat(weekly[0]?.style.left ?? '')).toBeCloseTo((7 / 42) * 100, 5);
    expect(Number.parseFloat(weekly[2]?.style.left ?? '')).toBeCloseTo(
      ((17 + 2 / 3) / 42) * 100,
      5,
    );
    expect(Number.parseFloat(weekly[3]?.style.left ?? '')).toBeCloseTo((21.5 / 42) * 100, 5);
    expect(weekly[0]?.title).toBe(
      'Clôture le 12 octobre 2026 à 00h00 — factures du 11 octobre 2026',
    );
    expect(weekly[1]?.title).toBe('Avis de prélèvement le 12 octobre 2026');
    expect(weekly[2]?.title).toBe('Dépôt avant le 22 octobre 2026 à 16h00');
    expect(weekly[3]?.title).toBe('Prélèvement le 26 octobre 2026');
  });

  it('sans limite de dépôt réglée : pas de marque de dépôt', async () => {
    const base = calendar();
    const fixture = await render(
      calendar({
        rhythms: base.rhythms.map((lane) => ({
          ...lane,
          periods: lane.periods.map((period) => ({ ...period, depositDeadline: null })),
        })),
      }),
    );

    expect(marks(fixture, 0).map((mark) => mark.dataset['kind'])).toEqual([
      'closure',
      'notice',
      'collection',
    ]);
  });

  it('ne pose pas une marque hors de l’axe, mais la phrase de la période la garde', async () => {
    const fixture = await render(calendar());
    const monthly = marks(fixture, 2);

    // Le 1er octobre (clôture et avis) est avant l'axe ; le 16 novembre, après.
    expect(monthly.map((mark) => mark.title)).toEqual([
      'Dépôt avant le 13 octobre 2026 à 16h00',
      'Prélèvement le 15 octobre 2026',
      'Clôture le 1 novembre 2026 à 00h00 — factures du 31 octobre 2026',
      'Avis de prélèvement le 1 novembre 2026',
      'Dépôt avant le 12 novembre 2026 à 16h00',
    ]);
    expect(root(fixture).textContent).toContain(
      'Clôture le 1 novembre 2026, avis le 1 novembre 2026, ' +
        'dépôt avant le 12 novembre 2026 à 16h00, prélèvement le 16 novembre 2026.',
    );
  });

  it('annonce la prochaine procédure de chaque rythme, ou son absence', async () => {
    const fixture = await render(calendar());
    const next = [...root(fixture).querySelectorAll('.lanes-next')].map((line) =>
      (line.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

    expect(next).toEqual([
      'Prochaine procédure : clôture 12 octobre 2026 · dépôt avant 22 octobre 2026 16h00 · ' +
        'prélèvement 26 octobre 2026 · Ouvrir la procédure',
      'Aucun prélèvement sur la période affichée',
      'Prochaine procédure : clôture 1 octobre 2026 · dépôt avant 13 octobre 2026 16h00 · ' +
        'prélèvement 15 octobre 2026 · Ouvrir la procédure',
    ]);
  });

  it('ouvre le lot s’il est constitué, sinon la procédure de l’entité', async () => {
    const fixture = await render(calendar());
    const links = [...root(fixture).querySelectorAll<HTMLAnchorElement>('.lanes-next a')];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/comptabilite/procedure-de-prelevement?entite=le1&lot=b_weekly',
      '/comptabilite/procedure-de-prelevement?entite=le1',
    ]);
  });

  it('limite de dépôt non réglée : le dit, et renvoie aux réglages de l’entité', async () => {
    const base = calendar();
    const fixture = await render(
      calendar({
        rhythms: base.rhythms.map((lane) => ({
          ...lane,
          periods: lane.periods.map((period) => ({ ...period, depositDeadline: null })),
        })),
      }),
    );
    const weekly = root(fixture).querySelectorAll('.lanes-next')[0];

    expect(weekly?.textContent).toContain('clôture 12 octobre 2026 · limite de dépôt non réglée');
    expect(
      [...(weekly?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href')),
    ).toEqual([
      '/comptabilite/entites-juridiques/le1',
      '/comptabilite/procedure-de-prelevement?entite=le1&lot=b_weekly',
    ]);
  });

  it('place aujourd’hui au milieu de son jour, et le dit dans la légende', async () => {
    const fixture = await render(calendar());
    const today = root(fixture).querySelector<HTMLElement>('.lanes-today');

    expect(Number.parseFloat(today?.style.left ?? '')).toBeCloseTo((3.5 / 42) * 100, 5);
    expect(root(fixture).textContent).toContain('Aujourd’hui, 8 octobre 2026');
  });

  it('dit l’axe, le délai réglé et la légende des marques', async () => {
    const fixture = await render(calendar({ preNotificationDays: 21 }));
    const body = root(fixture).textContent ?? '';

    expect(body).toContain('Du 5 oct. au 15 novembre 2026');
    expect(body).toContain('Délai de pré-notification réglé sur l’entité : 21 jours.');
    expect(body).toContain('Clôture — factures émises la veille à 23h55');
    expect(body).toContain('Avis de prélèvement (pré-notification)');
    expect(body).toContain('Limite de dépôt du fichier à la banque');
    expect(body).toContain('Prélèvement — échéance');
  });

  it('gradue les lundis de l’axe', async () => {
    const fixture = await render(calendar());
    const weeks = [...root(fixture).querySelectorAll('.lanes-week')].map(
      (week) => week.textContent,
    );

    expect(weeks).toEqual(['12 oct.', '19 oct.', '26 oct.', '2 nov.', '9 nov.']);
  });
});
