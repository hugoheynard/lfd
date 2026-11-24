import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { PeriodQuoteCommitmentPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PeriodQuotesService } from '../../comptabilite/period-quotes.service';
import {
  PeriodQuoteCommitmentPanel,
  type PeriodQuoteCommitmentPanelData,
} from './period-quote-commitment-panel';

const DATA: PeriodQuoteCommitmentPanelData = {
  quoteId: 'pq_1',
  number: 'D-20261031-1',
  version: 1,
  payerName: 'Caserne des Alpes',
  totalCents: 12_000,
};

interface Sent {
  readonly quoteId: string;
  readonly payload: PeriodQuoteCommitmentPayload;
  readonly key: string;
}

/** Le panneau, son double d'API (refus puis succès, selon `outcomes`), et ce qu'il a rendu. */
async function boot(outcomes: (HttpErrorResponse | { invoiceId: string })[]) {
  const sent: Sent[] = [];
  const closed: { value: unknown } = { value: 'open' };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PeriodQuoteCommitmentPanel],
    providers: [
      {
        provide: PeriodQuotesService,
        useValue: {
          receiveCommitment: (
            quoteId: string,
            payload: PeriodQuoteCommitmentPayload,
            key: string,
          ) => {
            sent.push({ quoteId, payload, key });
            const outcome = outcomes.shift();
            return outcome !== undefined && 'invoiceId' in outcome
              ? Promise.resolve(outcome)
              : Promise.reject(outcome ?? new Error('aucune issue prévue'));
          },
        },
      },
      { provide: FoldPanelRef, useValue: { close: (value?: unknown) => (closed.value = value) } },
    ],
  });
  const fixture = TestBed.createComponent(PeriodQuoteCommitmentPanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const type = (text: string): void => {
    const input = root.querySelector<HTMLInputElement>('[data-commitment-number] input');
    if (input === null) throw new Error('champ du numéro introuvable');
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = async (): Promise<void> => {
    root.querySelector<HTMLButtonElement>('[data-commitment-submit]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, root, sent, closed, type, submit };
}

/** Le refus nommé du serveur, tel que l'enveloppe d'API le porte. */
function refusal(message: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 409,
    error: { code: 'accounting.period_quote.commitment_outdated', message },
  });
}

describe('PeriodQuoteCommitmentPanel', () => {
  it('n’enregistre rien tant que le numéro est vide', async () => {
    const { root, sent, submit } = await boot([]);

    expect(root.querySelector<HTMLButtonElement>('[data-commitment-submit]')?.disabled).toBe(true);
    await submit();
    expect(sent).toEqual([]);
  });

  it('envoie le numéro rogné et se ferme sur la facture émise', async () => {
    const { sent, closed, type, submit } = await boot([{ invoiceId: 'inv_1' }]);

    type('  1300012345 ');
    await submit();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.quoteId).toBe('pq_1');
    expect(sent[0]?.payload).toEqual({ number: '1300012345' });
    expect(closed.value).toEqual({ invoiceId: 'inv_1' });
  });

  it('affiche le refus du serveur tel quel, reste ouvert, et réessaie sous la même clé', async () => {
    const message =
      'Le devis n° D-20261031-1 (version 1) n’est plus à jour : renvoyez-le avant d’enregistrer l’engagement.';
    const { root, sent, closed, type, submit } = await boot([
      refusal(message),
      { invoiceId: 'inv_1' },
    ]);

    type('1300012345');
    await submit();

    expect(root.querySelector('[data-commitment-error]')?.textContent).toContain(message);
    expect(closed.value).toBe('open');

    await submit();
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(closed.value).toEqual({ invoiceId: 'inv_1' });
  });
});
