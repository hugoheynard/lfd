import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { ShopAudience } from '../catalogue.service';
import { ReviewRowNote } from './review-row-note';

/**
 * La note de validation sous une ligne : les seuls boutons utiles, selon les
 * audiences attendues (Hugo, 2026-10-17).
 */
async function render(audiences: readonly ShopAudience[]) {
  const fixture = TestBed.createComponent(ReviewRowNote);
  fixture.componentRef.setInput('name', 'Croissant');
  fixture.componentRef.setInput('audiences', audiences);
  const emitted: (readonly ShopAudience[])[] = [];
  fixture.componentInstance.approve.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, emitted, host: fixture.nativeElement as HTMLElement };
}

function labels(host: HTMLElement): string[] {
  return [...host.querySelectorAll('button')].map((node) => node.textContent?.trim() ?? '');
}

describe('ReviewRowNote', () => {
  it('une audience : un seul bouton, qui la nomme', async () => {
    const { host, emitted } = await render(['pro']);

    expect(labels(host)).toEqual(['Valider pour les pros']);
    host.querySelector('button')?.click();
    expect(emitted).toEqual([['pro']]);
  });

  it('deux audiences : « Valider » émet les deux', async () => {
    const { host, emitted } = await render(['pro', 'public']);

    expect(host.textContent).toContain('pour les pros et la boutique');
    [...host.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === 'Valider')
      ?.click();
    expect(emitted).toEqual([['pro', 'public']]);
  });

  it('deux audiences : le menu offre chacune seule', async () => {
    const { fixture, host, emitted } = await render(['pro', 'public']);

    [...host.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === 'Une seule…')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    [...host.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === 'Seulement la boutique')
      ?.click();

    expect(emitted).toEqual([['public']]);
  });
});
