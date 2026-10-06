import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { DeliveryRoundsDayView, DeliveryRunSheetView } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import { parisDayOf, shiftDay } from '../run-sheet';
import { stopOf } from '../run-sheet.fixture';
import { RunSheetService } from '../run-sheet.service';
import { DeliveryPage } from './livraison-page';

async function mount(
  read: (day: string) => Promise<DeliveryRunSheetView>,
  canSeePhotos = false,
  query: Record<string, string> = {},
  rounds: ((day: string) => Promise<DeliveryRoundsDayView>) | null = null,
) {
  const asked: string[] = [];
  const also: (readonly string[])[] = [];
  const roundsAsked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
      {
        provide: RunSheetService,
        useValue: {
          day: (day: string, alsoOrderIds: readonly string[] = []) => {
            asked.push(day);
            also.push(alsoOrderIds);
            return read(day);
          },
        },
      },
      {
        provide: DeliveryRoundsService,
        useValue: {
          day: (day: string) => {
            roundsAsked.push(day);
            return rounds === null ? Promise.reject(new Error('non lue')) : rounds(day);
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: string) =>
            permission === 'delivery_rounds:read' ? rounds !== null : canSeePhotos,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, asked, also, roundsAsked };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeliveryPage', () => {
  it('lit demain par défaut : la tournée se prépare la veille', async () => {
    const { asked } = await mount((day) => Promise.resolve({ day, roundCount: 0, stops: [] }));
    expect(asked).toEqual([shiftDay(parisDayOf(new Date()), 1)]);
  });

  it('dit un jour sans livraison par l’état vide', async () => {
    const { element } = await mount((day) => Promise.resolve({ day, roundCount: 0, stops: [] }));
    expect(element.querySelector('fold-empty-state')?.textContent).toContain(
      'Aucune livraison ce jour-là',
    );
  });

  it('dit l’échec de lecture en alerte', async () => {
    const { element } = await mount(() => Promise.reject(new Error('500')));
    expect(element.querySelector('[data-sheet-error]')?.getAttribute('tone')).toBe('alert');
  });

  it('montre les arrêts triés, leurs signalements, et aucun montant', async () => {
    const { element } = await mount((day) =>
      Promise.resolve({
        day,
        roundCount: 0,
        stops: [
          stopOf({ orderId: 'b', reference: 'CMD-B', window: null, withoutAtelierSheet: true }),
          stopOf({
            orderId: 'a',
            reference: 'CMD-A',
            window: { start: '08:00', end: '10:00', source: 'default' },
            signatureRequired: true,
            contact: { prenom: 'Lu', nom: 'Lu', telephone: '06 12 34 56 78' },
          }),
        ],
      }),
    );

    const stops = [...element.querySelectorAll('[data-stop]')];
    expect(stops).toHaveLength(2);
    expect(stops[0]?.textContent).toContain('CMD-A');
    expect(stops[0]?.querySelector('[data-default-window]')).not.toBeNull();
    expect(stops[0]?.querySelector('[data-signature]')).not.toBeNull();
    expect(stops[0]?.querySelector('a[href="tel:0612345678"]')).not.toBeNull();
    expect(stops[1]?.querySelector('[data-no-sheet]')).not.toBeNull();
    expect(stops[1]?.querySelector('[data-unlinked]')).not.toBeNull();
    expect(element.textContent).not.toContain('€');
  });

  it('ne tente pas la photo d’une étape sans le droit de lire les comptes', async () => {
    const view = (day: string): DeliveryRunSheetView => ({
      day,
      roundCount: 0,
      stops: [
        stopOf({
          addressBook: {
            companyId: 'c',
            addressId: 'ad',
            note: 'Sonner deux fois',
            gps: null,
            procedure: [
              {
                id: 's',
                title: 'Par la cour',
                body: 'Porte verte',
                hasPhoto: true,
                photoRevision: 'r-1',
              },
            ],
          },
        }),
      ],
    });
    const { element } = await mount((day) => Promise.resolve(view(day)));

    expect(element.querySelector('[data-procedure]')?.textContent).toContain('Par la cour');
    expect(element.querySelector('app-run-sheet-step-photo')).toBeNull();
    expect(element.textContent).toContain('Sonner deux fois');
  });

  it('rouvre le jour de l’URL, et retombe sur demain si le paramètre est mal formé', async () => {
    const empty = (day: string) => Promise.resolve({ day, roundCount: 0, stops: [] });
    expect((await mount(empty, false, { jour: '2026-10-24' })).asked).toEqual(['2026-10-24']);
    expect((await mount(empty, false, { jour: 'hier' })).asked).toEqual([
      shiftDay(parisDayOf(new Date()), 1),
    ]);
  });

  it('écrit le jour choisi dans l’URL sans empiler l’historique', async () => {
    const { fixture, asked } = await mount((day) =>
      Promise.resolve({ day, roundCount: 0, stops: [] }),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.debugElement
      .query(By.css('fold-date'))
      .triggerEventHandler('valueChange', '2026-10-24');
    await fixture.whenStable();

    expect(asked.at(-1)).toBe('2026-10-24');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { jour: '2026-10-24' }, replaceUrl: true }),
    );
  });

  it('nomme à la feuille les rapportées placées ce jour-là, pour qui lit les tournées (§ 4)', async () => {
    const composition = (day: string): Promise<DeliveryRoundsDayView> =>
      Promise.resolve({
        day,
        rounds: [],
        unassigned: [
          { orderId: 'o-back', reference: 'B', broughtBackAt: '2026-09-30T15:00:00.000Z' },
        ],
        incidents: [],
      });
    const empty = (day: string) => Promise.resolve({ day, roundCount: 0, stops: [] });
    const { also, roundsAsked } = await mount(empty, false, { jour: '2026-10-24' }, composition);

    await vi.waitFor(() => expect(also).toHaveLength(1));
    expect(roundsAsked).toEqual(['2026-10-24']);
    expect(also).toEqual([['o-back']]);
  });

  it('sans le droit des tournées, ne lit pas la composition : la feuille du jour seule', async () => {
    const { also, roundsAsked } = await mount((day) =>
      Promise.resolve({ day, roundCount: 0, stops: [] }),
    );

    expect(roundsAsked).toEqual([]);
    expect(also).toEqual([[]]);
  });

  it('une composition illisible ne prive pas la page de sa feuille', async () => {
    const { also, element, fixture } = await mount(
      (day) => Promise.resolve({ day, roundCount: 0, stops: [] }),
      false,
      {},
      () => Promise.reject(new Error('500')),
    );

    await vi.waitFor(() => expect(also).toEqual([[]]));
    fixture.detectChanges();
    expect(element.querySelector('[data-sheet-error]')).toBeNull();
  });

  it('se nomme « Feuille de route » et dit le jour et ses chiffres dans la bande', async () => {
    const { element } = await mount(
      (day) =>
        Promise.resolve({
          day,
          roundCount: 0,
          stops: [
            stopOf({ orderId: 'a', state: 'ready' }),
            stopOf({ orderId: 'b', state: 'expected', withoutAtelierSheet: true }),
          ],
        }),
      false,
      { jour: '2026-10-07' },
    );

    expect(element.querySelector('fold-page-layout')?.textContent).toContain('Feuille de route');
    expect(element.querySelector('[data-eyebrow]')?.textContent).toContain(
      'Livraisons du mercredi 7 octobre',
    );
    expect(element.querySelector('[data-headline]')?.textContent).toContain(
      '2 adresses · 1 colisée',
    );
    expect(element.querySelector('[data-summary-no-sheet]')).not.toBeNull();
  });

  it('tait l’avertissement sans feuille d’atelier quand il n’y en a aucune', async () => {
    const { element } = await mount((day) =>
      Promise.resolve({ day, roundCount: 0, stops: [stopOf({})] }),
    );
    expect(element.querySelector('[data-summary-no-sheet]')).toBeNull();
  });

  it('explique la page et renvoie aux tournées du même jour pour qui peut les lire', async () => {
    const composition = (day: string): Promise<DeliveryRoundsDayView> =>
      Promise.resolve({ day, rounds: [], unassigned: [], incidents: [] });
    const { element } = await mount(
      (day) => Promise.resolve({ day, roundCount: 0, stops: [] }),
      false,
      { jour: '2026-10-07' },
      composition,
    );

    expect(element.querySelector('[data-explain]')?.textContent).toContain(
      'Toutes les livraisons du jour, adresse par adresse',
    );
    expect(element.querySelector('[data-rounds-link]')?.getAttribute('href')).toBe(
      '/livraison/tournees?jour=2026-10-07',
    );
  });

  it('sans le droit des tournées, nomme l’écran sans lien', async () => {
    const { element } = await mount((day) => Promise.resolve({ day, roundCount: 0, stops: [] }));
    expect(element.querySelector('[data-rounds-link]')).toBeNull();
    expect(element.querySelector('[data-explain]')?.textContent).toContain('Tournées');
  });
});
