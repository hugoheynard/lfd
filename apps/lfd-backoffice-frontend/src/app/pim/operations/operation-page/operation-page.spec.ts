import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OperationAudience, OperationView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { ProductHttpApi } from '../../catalogue/product-http-api';
import { operationView } from '../operation-view.testing';
import { OperationsService } from '../operations.service';
import { OperationPage } from './operation-page';

class FakeOperations {
  row: OperationView = operationView();
  failure: unknown = null;
  readonly audiences: OperationAudience[] = [];
  archived = 0;

  async get(): Promise<OperationView> {
    if (this.failure !== null) {
      throw this.failure;
    }
    return this.row;
  }

  async setAudience(_key: string, audience: OperationAudience): Promise<void> {
    this.audiences.push(audience);
    this.row = { ...this.row, audience };
  }

  async archive(): Promise<void> {
    this.archived += 1;
    this.row = { ...this.row, archivedAt: '2026-09-24T10:00:00.000Z' };
  }
}

async function render(api: FakeOperations): Promise<ComponentFixture<OperationPage>> {
  TestBed.configureTestingModule({
    imports: [OperationPage],
    providers: [
      provideRouter([]),
      { provide: OperationsService, useValue: api },
      { provide: ProductHttpApi, useValue: { list: async () => [] } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(OperationPage);
  fixture.componentRef.setInput('key', 'noel-2026');
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<OperationPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('OperationPage', () => {
  it('montre une carte par sujet, l’état à côté du titre et un retour nommé', async () => {
    const fixture = await render(new FakeOperations());
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-presentation-card')).not.toBeNull();
    expect(root.querySelector('app-schedule-card')).not.toBeNull();
    expect(root.querySelector('app-selection-card')).not.toBeNull();
    expect(root.querySelector('fold-danger-zone')).not.toBeNull();
    expect(text(fixture)).toContain('En préparation');
    expect(text(fixture)).toContain('Clé noel-2026');
    expect(root.querySelector('fold-back-link')).not.toBeNull();
  });

  it('une opération introuvable se dit en français, avec Réessayer', async () => {
    const api = new FakeOperations();
    api.failure = new HttpErrorResponse({
      status: 404,
      error: { code: 'pim.operation.not_found', message: 'x' },
    });
    const fixture = await render(api);
    expect(text(fixture)).toContain("Cette opération n'existe pas, ou plus.");
    expect(text(fixture)).toContain('Réessayer');
  });

  it('enregistre la clientèle, puis relit l’opération', async () => {
    const api = new FakeOperations();
    const fixture = await render(api);
    const page = fixture.componentInstance;
    page['audience'].set('pro');
    await page['saveAudience']();
    expect(api.audiences).toEqual(['pro']);
    expect(page['operation']()?.audience).toBe('pro');
  });

  it('archivée : plus de zone de danger, plus d’Enregistrer, et elle le dit', async () => {
    const api = new FakeOperations();
    const fixture = await render(api);
    await fixture.componentInstance['archive']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(api.archived).toBe(1);
    expect(text(fixture)).toContain('Archivée');
    expect(root.querySelector('fold-danger-zone')).toBeNull();
    expect(text(fixture)).not.toContain('Enregistrer');
  });
});
