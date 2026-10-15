import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrderSalesTermsResponse } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminOrdersService } from '../orders.service';
import { OrderSalesTermsCard } from './order-sales-terms-card';

/** Une date seulement affichée : elle n'est comparée à aucune horloge. */
const UPLOADED_AT = '2026-10-12T08:30:00.000Z';

async function render(read: () => Promise<OrderSalesTermsResponse>): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AdminOrdersService,
        useValue: { salesTerms: () => read() } satisfies Pick<AdminOrdersService, 'salesTerms'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderSalesTermsCard);
  fixture.componentRef.setInput('orderId', 'o_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const sentenceOf = (element: HTMLElement): string =>
  element
    .querySelector('[data-order-sales-terms-sentence]')
    ?.textContent?.replace(/\s+/g, ' ')
    .trim() ?? '';

describe('OrderSalesTermsCard', () => {
  it('dit « acceptées » quand le client a commandé, avec la révision et le PDF', async () => {
    const element = await render(() =>
      Promise.resolve({
        salesTerms: {
          document: 'salesTermsPro',
          revision: 4,
          file: { id: 'ldf_1', uploadedAt: UPLOADED_AT },
          placedByStaff: false,
        },
      }),
    );

    expect(sentenceOf(element)).toContain(
      'CGV acceptées : professionnelles, révision 4, PDF du 12/10/2026',
    );
    expect(element.querySelector('fold-link')?.textContent).toContain('Télécharger ce PDF');
  });

  /** C4′ : saisie par l'équipe, le client n'a rien accepté. */
  it('dit « applicables » quand l’équipe a saisi la commande', async () => {
    const element = await render(() =>
      Promise.resolve({
        salesTerms: { document: 'salesTerms', revision: null, file: null, placedByStaff: true },
      }),
    );

    expect(sentenceOf(element)).toBe(
      'CGV applicables : particuliers, texte pas encore rédigé à la passation, aucun PDF de référence',
    );
    expect(element.querySelector('fold-link')).toBeNull();
  });

  it('une commande d’avant l’enregistrement : aucune version inventée', async () => {
    const element = await render(() => Promise.resolve({ salesTerms: null }));

    expect(element.querySelector('[data-order-sales-terms-unknown]')).not.toBeNull();
    expect(element.querySelector('[data-order-sales-terms-sentence]')).toBeNull();
  });

  it('un échec de lecture reste dans la carte', async () => {
    const element = await render(() => Promise.reject(new Error('réseau')));

    expect(element.querySelector('fold-empty-state')).not.toBeNull();
  });
});
