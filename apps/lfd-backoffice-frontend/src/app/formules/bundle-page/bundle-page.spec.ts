import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  BundleView,
  EditBundlePresentationPayload,
  SaveBundleCompositionPayload,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { newGroup, renamed } from '../bundle-draft';
import { bundleChoice, bundleGroup, bundleView } from '../bundle.testing';
import { BundlesService } from '../bundles.service';
import { BundlePage } from './bundle-page';

const WRITER: readonly StaffPermission[] = ['shop_bundles:read', 'shop_bundles:write'];

interface Fake {
  view: BundleView;
  compositions: SaveBundleCompositionPayload[];
  presentations: EditBundlePresentationPayload[];
  refuse: HttpErrorResponse | null;
}

async function render(granted: readonly StaffPermission[] = WRITER, view = bundleView()) {
  const fake: Fake = { view, compositions: [], presentations: [], refuse: null };
  TestBed.configureTestingModule({
    imports: [BundlePage],
    providers: [
      provideRouter([]),
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: BundlesService,
        useValue: {
          get: async () => fake.view,
          saveComposition: async (_key: string, payload: SaveBundleCompositionPayload) => {
            if (fake.refuse !== null) {
              throw fake.refuse;
            }
            fake.compositions.push(payload);
            return { key: fake.view.key };
          },
          editPresentation: async (_key: string, payload: EditBundlePresentationPayload) => {
            fake.presentations.push(payload);
            return { key: fake.view.key };
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          permissions: signal(granted),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BundlePage);
  fixture.componentRef.setInput('key', view.key);
  await fixture.whenStable();
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const save = (card: number) =>
    root
      .querySelectorAll('fold-card')
      [card]?.querySelector('button[titleAction]') as HTMLButtonElement | null;
  return { fixture, page: fixture.componentInstance, root, fake, save };
}

describe('BundlePage', () => {
  it('Enregistrer la composition n’est actif que si elle a changé', async () => {
    const { fixture, page, save } = await render();
    expect(save(1)?.disabled).toBe(true);
    page['groups'].update((groups) => renamed(groups, 'boisson', 'Boissons'));
    fixture.detectChanges();
    expect(save(1)?.disabled).toBe(false);
  });

  it('envoie la composition entière en un PUT, clés gardées et groupe neuf à null', async () => {
    const { page, fake } = await render();
    page['groups'].update((groups) => [
      ...renamed(groups, 'boisson', 'Boissons'),
      { ...newGroup('Dessert'), choices: [{ ...bundleChoice({ sku: 'TARTE-1' }) }] },
    ]);
    await page['saveComposition']();
    expect(fake.compositions).toEqual([
      {
        groups: [
          { key: 'boisson', label: 'Boissons', choices: ['CAFE-1'] },
          { key: 'viennoiserie', label: 'Viennoiserie', choices: ['CROI-1'] },
          { key: null, label: 'Dessert', choices: ['TARTE-1'] },
        ],
      },
    ]);
  });

  it('affiche le refus du serveur sans perdre la saisie', async () => {
    const { fixture, page, root, fake } = await render();
    fake.refuse = new HttpErrorResponse({
      status: 409,
      error: {
        code: 'bundles.choice_not_served_to_public',
        message: 'Le Café n’est pas servi au public.',
      },
    });
    page['groups'].update((groups) => renamed(groups, 'boisson', 'Boissons'));
    await page['saveComposition']();
    fixture.detectChanges();
    expect(root.textContent).toContain('Le Café n’est pas servi au public.');
    expect(page['groups']()[0]?.label).toBe('Boissons');
  });

  it('dit avant l’envoi qu’il faut deux groupes, et n’envoie rien', async () => {
    const { fixture, page, root, fake, save } = await render();
    page['groups'].update((groups) => groups.slice(0, 1));
    fixture.detectChanges();
    expect(root.textContent).toContain('au moins 2 groupes');
    expect(save(1)?.disabled).toBe(true);
    await page['saveComposition']();
    expect(fake.compositions).toEqual([]);
  });

  it('enregistrer la présentation garde la composition en cours', async () => {
    const { page, fake } = await render();
    page['groups'].update((groups) => renamed(groups, 'boisson', 'Boissons'));
    page['description'].set('Un café, une viennoiserie.');
    await page['savePresentation']();
    expect(fake.presentations).toEqual([
      { name: 'Petit-déjeuner', description: 'Un café, une viennoiserie.' },
    ]);
    expect(page['groups']()[0]?.label).toBe('Boissons');
  });

  it('marque un article non admissible et le signale en tête', async () => {
    const { root } = await render(
      WRITER,
      bundleView({
        groups: [
          bundleGroup({ choices: [bundleChoice({ standing: 'operation_only' })] }),
          bundleGroup({ key: 'b', label: 'B' }),
        ],
      }),
    );
    expect(root.textContent).toContain("n'est plus admissible");
    expect(root.textContent).toContain('Réservé aux opérations');
  });

  it('en lecture seule : ni Enregistrer, ni Retirer, et la page le dit', async () => {
    const { root } = await render(['shop_bundles:read']);
    expect(root.textContent).toContain('Lecture seule');
    expect(root.querySelector('button[titleAction]')).toBeNull();
    expect(root.querySelector('fold-danger-zone')).toBeNull();
    expect(root.querySelector('fold-button-icon')).toBeNull();
  });

  it('retirée : se lit, et se remet en brouillon', async () => {
    const { root } = await render(WRITER, bundleView({ status: 'withdrawn' }));
    expect(root.textContent).toContain('Remettre en brouillon');
    expect(root.querySelector('fold-danger-zone')).toBeNull();
    expect(root.querySelector('button[titleAction]')).toBeNull();
  });

  it('dit que la mise en vente viendra avec le prix', async () => {
    const { root } = await render();
    expect(root.textContent).toContain('La mise en vente viendra avec le prix.');
  });
});
