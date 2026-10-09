import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectionReturnView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { collectionReturn } from '../../comptabilite/__tests__/collection-return-fixture';
import { CollectionReturnsService } from '../../comptabilite/collection-returns.service';
import { CollectionReturnsCard } from './collection-returns-card';

async function boot(
  read: () => Promise<readonly CollectionReturnView[]>,
  canRead = true,
): Promise<ComponentFixture<CollectionReturnsCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CollectionReturnsService, useValue: { ofPayer: read } },
      { provide: PermissionsStore, useValue: { can: (): boolean => canRead } },
    ],
  });
  const fixture = TestBed.createComponent(CollectionReturnsCard);
  fixture.componentRef.setInput('companyId', 'co_port');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<CollectionReturnsCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('CollectionReturnsCard', () => {
  it('« Prélèvement rejeté le … (motif) », et le chemin pour le traiter', async () => {
    const fixture = await boot(() => Promise.resolve([collectionReturn()]));
    const card = host(fixture).querySelector('[data-collection-returns]');
    expect(card?.textContent).toContain(
      'Prélèvement rejeté le 16 oct. 2026 (Provision insuffisante)',
    );
    expect(card?.textContent).toContain('pas bloqué d');
    expect(card?.querySelector('a')?.getAttribute('href')).toBe(
      '/comptabilite/prelevement-du-mois',
    );
  });

  it('rien quand il n’y a aucun retour, ni sans la lecture comptable', async () => {
    const none = await boot(() => Promise.resolve([]));
    expect(host(none).querySelector('[data-collection-returns]')).toBeNull();
    let asked = false;
    const blind = await boot(() => {
      asked = true;
      return Promise.resolve([collectionReturn()]);
    }, false);
    expect(asked).toBe(false);
    expect(host(blind).querySelector('[data-collection-returns]')).toBeNull();
  });

  it('dit l’échec de lecture', async () => {
    const fixture = await boot(() => Promise.reject(new Error('réseau')));
    expect(host(fixture).querySelector('[data-collection-returns-error]')).not.toBeNull();
  });
});
