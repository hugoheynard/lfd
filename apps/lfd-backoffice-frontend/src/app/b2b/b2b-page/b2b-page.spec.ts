import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { B2bPage } from './b2b-page';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **La coquille de l'espace B2B.** Le bandeau d'arrivée est parti en X2
 * (2026-10-17) avec la boîte de réception : la coquille ne lit plus rien, elle
 * pose le rail et rend la page routée.
 */
describe('B2bPage', () => {
  it('rend la page routée, sans bandeau d’arrivée', async () => {
    TestBed.configureTestingModule({
      imports: [B2bPage],
      providers: [
        provideRouter([]),
        {
          provide: WorkspaceCatalogue,
          useValue: { rail: () => signal({ title: 'E-commerce LFC', icon: 'store', items: [] }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(B2bPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('router-outlet')).not.toBeNull();
    expect(host.querySelector('fold-callout')).toBeNull();
  });
});
