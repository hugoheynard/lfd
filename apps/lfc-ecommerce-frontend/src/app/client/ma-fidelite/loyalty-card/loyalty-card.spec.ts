import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { MyLoyaltyView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { CLOSED_LOYALTY, EMPTY_LOYALTY, OPEN_LOYALTY } from '../../client-loyalty.fixture';
import { provideRecognised } from '../../client-orders.fixture';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { LoyaltyCard } from './loyalty-card';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
};

const isRead = (url: string): boolean => url.endsWith('/me/loyalty');
const isConversion = (url: string): boolean => url.endsWith('/me/loyalty/conversions');

describe('LoyaltyCard', () => {
  let fixture: ComponentFixture<LoyaltyCard>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );

  async function mount(view?: MyLoyaltyView): Promise<void> {
    fixture = TestBed.createComponent(LoyaltyCard);
    // La carte ne lit rien elle-même : le service part de lui-même au premier
    // passage de détection, une fois l'espace personnel connu.
    TestBed.tick();
    await settle();
    if (view !== undefined) {
      http.expectOne((r) => isRead(r.url)).flush(view);
      await settle();
      fixture.detectChanges();
    }
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LoyaltyCard],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        // L'espace personnel : c'est là, et là seulement, que la lecture part.
        provideWorkspace(workspaceDouble()),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('attend la lecture sous un `fold-loading`', async () => {
    await mount();
    expect(el().querySelector('fold-loading')).not.toBeNull();
  });

  it('ne rend RIEN quand le programme est fermé', async () => {
    await mount(CLOSED_LOYALTY);
    expect(el().querySelector('fold-card')).toBeNull();
    expect(text().trim()).toBe('');
  });

  it('montre l’échec de lecture, et relit au clic', async () => {
    await mount();
    http.expectOne((r) => isRead(r.url)).flush(null, { status: 500, statusText: 'Erreur' });
    await settle();
    fixture.detectChanges();

    expect(el().querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    button('Réessayer')?.click();
    await settle();
    http.expectOne((r) => isRead(r.url)).flush(OPEN_LOYALTY);
    await settle();
    fixture.detectChanges();

    expect(text()).toContain('Votre solde');
  });

  it('dit le solde, la valeur HT d’un palier et les paliers convertibles', async () => {
    await mount(OPEN_LOYALTY);

    // `Intl` groupe les milliers d'une espace fine insécable en français.
    expect(text()).toContain('2\u202f350 points');
    expect(text()).toContain('points = un bon de 5,00 € HT');
    expect(text()).toContain('Vous pouvez convertir jusqu’à 2 paliers.');
    expect(text()).toContain('la baisse sur votre total est un peu plus grande, TVA comprise');
  });

  it('liste les bons en HT, avec leur date limite ou leur commande', async () => {
    await mount(OPEN_LOYALTY);

    expect(text()).toContain('5,00 € HT');
    expect(text()).toContain('valable jusqu’au 27 septembre 2027');
    expect(text()).toContain('utilisé sur CMD-00042');
  });

  it('met l’historique dans les mots du client', async () => {
    await mount(OPEN_LOYALTY);

    expect(text()).toContain('Commande CMD-00041');
    expect(text()).toContain('Conversion en bon');
    expect(text()).toContain('+350');
  });

  it('montre l’état vide sans liste, et aucune conversion', async () => {
    await mount(EMPTY_LOYALTY);

    expect(text()).toContain('Pas encore de points');
    expect(el().querySelector('.rows')).toBeNull();
    expect(el().querySelector('fold-inline-confirm')).toBeNull();
    expect(text()).toContain('Pas encore assez de points pour un bon.');
  });

  it('convertit après confirmation, avec le solde affiché', async () => {
    await mount(OPEN_LOYALTY);

    button('Convertir en bon')?.click();
    fixture.detectChanges();
    expect(text()).toContain('Convertir 1\u202f000 points en un bon de 5,00 € HT ?');
    button('Convertir')?.click();
    await settle();

    const req = http.expectOne((r) => isConversion(r.url));
    expect(req.request.body).toEqual({ steps: 1, expectedBalancePoints: 2350 });
    req.flush({ voucherId: 'v_new' }, { status: 201, statusText: 'Created' });
    await settle();
    http.expectOne((r) => isRead(r.url)).flush({ ...OPEN_LOYALTY, balancePoints: 1350 });
    await settle();
    fixture.detectChanges();

    expect(text()).toContain('Votre bon de 5,00 € HT est prêt.');
  });

  it('affiche « votre solde a changé » sur un 409, et relit', async () => {
    await mount(OPEN_LOYALTY);

    button('Convertir en bon')?.click();
    fixture.detectChanges();
    button('Convertir')?.click();
    await settle();
    http
      .expectOne((r) => isConversion(r.url))
      .flush(
        { code: 'loyalty.balance_changed', message: '…' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    http
      .expectOne((r) => isRead(r.url))
      .flush({ ...OPEN_LOYALTY, balancePoints: 1350, convertibleSteps: 1 });
    await settle();
    fixture.detectChanges();

    expect(el().querySelector('fold-callout[variant="alert"]')?.textContent).toContain(
      'Votre solde a changé',
    );
    expect(text()).toContain('Vous pouvez convertir 1 palier.');
  });
});
