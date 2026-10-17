import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { PrepareCommerceOperationPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { CommerceOperationsService } from '../commerce-operations.service';
import { PrepareCommerceOperationPanel } from './prepare-commerce-operation-panel';

function setup(prepare: (payload: PrepareCommerceOperationPayload) => Promise<{ key: string }>) {
  const closed: (string | undefined)[] = [];
  const sent: PrepareCommerceOperationPayload[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelRef, useValue: { close: (value?: string) => closed.push(value) } },
      {
        provide: CommerceOperationsService,
        useValue: {
          prepare: (payload: PrepareCommerceOperationPayload) => {
            sent.push(payload);
            return prepare(payload);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PrepareCommerceOperationPanel);
  fixture.detectChanges();
  return { panel: fixture.componentInstance, closed, sent };
}

function fill(panel: PrepareCommerceOperationPanel): void {
  panel['key'].set('noel-2026');
  panel['name'].set('Noël 2026');
  panel['schedule'].set({
    announceDay: '2026-11-01',
    announceTime: '00:00',
    orderFromDay: '',
    orderFromTime: '',
    orderUntilDay: '2026-12-21',
    orderUntilTime: '12:00',
    pickupFrom: '2026-12-23',
    pickupUntil: '2026-12-24',
  });
}

describe('PrepareCommerceOperationPanel', () => {
  it('dit ce qui manque tant que la saisie est incomplète', () => {
    const { panel } = setup(async () => ({ key: 'x' }));
    expect(panel['missing']()).toContain('clé');
    panel['key'].set('noel-2026');
    expect(panel['missing']()).toContain('nom');
  });

  it('envoie les instants en heure de Paris, sans chapeau ni image, et ferme sur la clé', async () => {
    const { panel, sent, closed } = setup(async () => ({ key: 'noel-2026' }));
    fill(panel);
    expect(panel['missing']()).toBeNull();
    await panel['submit']();
    expect(sent[0]).toEqual({
      key: 'noel-2026',
      name: { fr: 'Noël 2026' },
      lede: null,
      image: null,
      audience: 'both',
      announceFrom: '2026-10-31T23:00:00.000Z',
      orderFrom: null,
      orderUntil: '2026-12-21T11:00:00.000Z',
      pickupFrom: '2026-12-23',
      pickupUntil: '2026-12-24',
    });
    expect(closed).toEqual(['noel-2026']);
  });

  it('un refus reste dans le panneau, dit par le serveur', async () => {
    const { panel, closed } = setup(async () => {
      throw new HttpErrorResponse({
        status: 409,
        error: { code: 'operations.key_taken', message: 'La clé « noel-2026 » est déjà prise.' },
      });
    });
    fill(panel);
    await panel['submit']();
    expect(closed).toEqual([]);
    expect(panel['refusal']()).toBe('La clé « noel-2026 » est déjà prise.');
  });
});
