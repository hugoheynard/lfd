import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { PrepareOperationPayload } from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { OperationsService } from '../operations.service';
import { PrepareOperationPanel } from './prepare-operation-panel';

function setup(prepare: (payload: PrepareOperationPayload) => Promise<{ key: string }>) {
  const closed: (string | undefined)[] = [];
  const sent: PrepareOperationPayload[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelRef, useValue: { close: (value?: string) => closed.push(value) } },
      {
        provide: OperationsService,
        useValue: {
          prepare: (payload: PrepareOperationPayload) => {
            sent.push(payload);
            return prepare(payload);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PrepareOperationPanel);
  fixture.detectChanges();
  return { fixture, panel: fixture.componentInstance, closed, sent };
}

function fill(panel: PrepareOperationPanel): void {
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

describe('PrepareOperationPanel', () => {
  it('dit ce qui manque tant que la saisie est incomplète', () => {
    const { panel } = setup(async () => ({ key: 'x' }));
    expect(panel['missing']()).toContain('clé');
    panel['key'].set('noel-2026');
    expect(panel['missing']()).toContain('nom');
  });

  it('envoie les instants convertis en heure de Paris, et ferme sur la clé', async () => {
    const { panel, sent, closed } = setup(async () => ({ key: 'noel-2026' }));
    fill(panel);
    expect(panel['missing']()).toBeNull();
    await panel['submit']();
    expect(sent[0]).toMatchObject({
      key: 'noel-2026',
      name: { fr: 'Noël 2026' },
      audience: 'both',
      announceFrom: '2026-10-31T23:00:00.000Z',
      orderFrom: null,
      orderUntil: '2026-12-21T11:00:00.000Z',
    });
    expect(closed).toEqual(['noel-2026']);
  });

  it('une clé prise reste dans le panneau, dite en français', async () => {
    const { panel, closed } = setup(async () => {
      throw new HttpErrorResponse({
        status: 409,
        error: { code: 'pim.operation.key_taken', message: 'x' },
      });
    });
    fill(panel);
    await panel['submit']();
    expect(closed).toEqual([]);
    expect(panel['refusal']()).toContain('Une clé ne se réemploie jamais');
  });
});
