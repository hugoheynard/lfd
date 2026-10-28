import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CatalogReemissionView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { ReemissionHttpApi } from '../reemission-http-api';
import { ReemissionPanel } from '../reemission-panel/reemission-panel';
import { aJob } from './reemission-fixtures';

/** Monte le panneau, avec ou sans le droit, devant une API doublée. */
async function render(options: {
  readonly canWrite: boolean;
  readonly productId?: string;
  readonly latest?: CatalogReemissionView | null;
  readonly launched?: CatalogReemissionView;
}) {
  const starts: (string | null)[] = [];
  const api: Pick<ReemissionHttpApi, 'start' | 'byId' | 'latest'> = {
    start: (productId) => {
      starts.push(productId);
      return Promise.resolve('job_1');
    },
    byId: () => Promise.resolve(options.launched ?? aJob({ status: 'done' })),
    latest: () => Promise.resolve(options.latest ?? null),
  };
  TestBed.configureTestingModule({
    imports: [ReemissionPanel],
    providers: [
      provideRouter([]),
      { provide: ReemissionHttpApi, useValue: api },
      { provide: PermissionsStore, useValue: { can: () => options.canWrite } },
    ],
  });
  const fixture = TestBed.createComponent(ReemissionPanel);
  if (options.productId !== undefined) {
    fixture.componentRef.setInput('productId', options.productId);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element, starts };
}

describe('ReemissionPanel', () => {
  it('ne montre rien sans le droit de réémettre', async () => {
    const { element } = await render({ canWrite: false, latest: aJob() });

    expect(element.textContent?.trim()).toBe('');
  });

  it('montre la dernière réémission et son compte rendu, échecs nommés', async () => {
    const latest = aJob({
      status: 'done',
      productsAttempted: 3,
      productsSucceeded: 2,
      failures: [{ productId: 'prd_2', name: 'Cannelé', reason: 'verrou refusé' }],
    });
    const { element } = await render({ canWrite: true, latest });

    const text = element.textContent ?? '';
    expect(text).toContain('Tout réémettre');
    expect(text).toContain('Terminée');
    expect(text).toContain('Fiches tentées');
    expect(text).toContain('Cannelé');
    expect(text).toContain('verrou refusé');
    expect(text).toContain('Hugo Heynard');
  });

  it('écrit ce qui a tout arrêté', async () => {
    const latest = aJob({ status: 'failed', error: 'La famille cat_1 n’a pas pu être réémise.' });
    const { element } = await render({ canWrite: true, latest });

    expect(element.textContent).toContain('Arrêtée');
    expect(element.textContent).toContain('La famille cat_1');
  });

  it('réémet la fiche demandée, et affiche son issue', async () => {
    const launched = aJob({
      scope: 'product',
      productId: 'prd_1',
      status: 'done',
      productsAttempted: 1,
      productsSucceeded: 1,
    });
    const { fixture, element, starts } = await render({
      canWrite: true,
      productId: 'prd_1',
      launched,
    });
    expect(element.textContent).not.toContain('Terminée');

    const button = [...element.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Réémettre',
    );
    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(starts).toEqual(['prd_1']);
    expect(element.textContent).toContain('Terminée');
  });
});
