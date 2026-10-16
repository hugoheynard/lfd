import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CommerceOperationView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { commerceOperation } from '../commerce-operation.testing';
import { CommerceOperationsService } from '../commerce-operations.service';
import { CommerceOperationPage } from './commerce-operation-page';

async function render(get: (key: string) => Promise<CommerceOperationView>) {
  TestBed.configureTestingModule({
    imports: [CommerceOperationPage],
    providers: [provideRouter([]), { provide: CommerceOperationsService, useValue: { get } }],
  });
  const fixture = TestBed.createComponent(CommerceOperationPage);
  fixture.componentRef.setInput('key', 'noel-2026');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CommerceOperationPage', () => {
  it("dit l'interrupteur fermé en callout", async () => {
    const root = await render(async () => {
      throw { status: 409, error: { code: 'operations.not_at_commerce', message: '…' } };
    });
    expect(root.querySelector('fold-callout')?.textContent).toContain('OPERATIONS_AT_COMMERCE');
    expect(root.querySelector('fold-empty-state')).toBeNull();
  });

  it('dit, article par article, ce qui n’est pas en vente', async () => {
    const root = await render(async () =>
      commerceOperation({ skus: ['BUCHE-01', 'STOLLEN-01'], sellingSkus: ['BUCHE-01'] }),
    );
    const articles = [...root.querySelectorAll('.article')];
    expect(articles.map((li) => li.textContent?.includes('Pas en vente'))).toEqual([false, true]);
    expect(root.textContent).toContain('1 en vente sur 2');
    expect(root.textContent).toContain('La bûche, le panettone et le stollen.');
  });

  it("dit le refus du serveur quand l'opération est illisible", async () => {
    const root = await render(async () => {
      throw { status: 404, error: { code: 'operations.not_found', message: 'Introuvable.' } };
    });
    expect(root.querySelector('fold-empty-state')?.textContent).toContain('Introuvable.');
  });
});
