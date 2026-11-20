import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NESTED_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { type MenuDraft, OPEN_DRAFT } from '../site-menu-draft';
import { SiteMenuEditor } from './site-menu-editor';

function render(inputs: Record<string, unknown>): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ShopCatalogue,
        useValue: {
          items: signal(NESTED_CATALOGUE.items),
          shelves: signal(NESTED_CATALOGUE.shelves),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SiteMenuEditor);
  Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const save = (_draft: MenuDraft): Promise<string | null> => Promise.resolve(null);

describe('SiteMenuEditor', () => {
  it('attend un changement avant d’enregistrer une carte déjà posée', () => {
    const host = render({ initial: OPEN_DRAFT, save });
    expect(host.querySelector<HTMLButtonElement>('[data-save]')?.disabled).toBe(true);
  });

  it('enregistre sans changement une carte pas encore posée à cet endroit', () => {
    const host = render({ initial: OPEN_DRAFT, unsaved: true, save });
    expect(host.querySelector<HTMLButtonElement>('[data-save]')?.disabled).toBe(false);
  });

  it('en lecture, ne montre ni réglage ni bouton', () => {
    const host = render({ initial: OPEN_DRAFT, canWrite: false });
    expect(host.querySelector('fold-view-toggle')).toBeNull();
    expect(host.querySelector('[data-save]')).toBeNull();
    expect(host.querySelector('[data-mode-read]')?.textContent).toContain('Tout, sauf');
  });
});
