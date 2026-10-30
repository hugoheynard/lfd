import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { PromotionTermsPayload, PublishedCatalogView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { promotionView } from '../promotion.testing';
import { PromotionsService } from '../promotions.service';
import { PromotionEditorPage } from './promotion-editor-page';

const CATALOGUE: PublishedCatalogView = { shelves: [], entries: [], pendingReview: [] };

@Component({ selector: 'app-stub-fiche', template: '' })
class StubFiche {}

/** Ce que le faux service a reçu — l'écran ne doit rien envoyer qu'on n'ait demandé. */
interface Sent {
  readonly revised: { id: string; terms: PromotionTermsPayload; reason: string | null }[];
  readonly posed: PromotionTermsPayload[];
}

async function render(
  inputs: { id?: string; pickupId?: string },
  write: { revise?: () => Promise<void>; pose?: () => Promise<string> } = {},
) {
  const sent: Sent = { revised: [], posed: [] };
  TestBed.configureTestingModule({
    imports: [PromotionEditorPage],
    providers: [
      provideRouter([{ path: 'promotions-ciblees/:id', component: StubFiche }]),
      {
        provide: PromotionsService,
        useValue: {
          pickupNames: async () => new Map([['pk_coeur', 'Cœur de station']]),
          get: async () => promotionView({ internalName: 'Croissants' }),
          revise: async (id: string, terms: PromotionTermsPayload, reason: string | null) => {
            sent.revised.push({ id, terms, reason });
            await write.revise?.();
          },
          pose: async (terms: PromotionTermsPayload) => {
            sent.posed.push(terms);
            return (await write.pose?.()) ?? 'promo_neuve';
          },
        },
      },
      { provide: CatalogueService, useValue: { published: async () => CATALOGUE } },
    ],
  });
  const fixture = TestBed.createComponent(PromotionEditorPage);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, fixture, sent };
}

/** Renomme la promotion, comme au clavier : le brouillon cesse d'égaler la relue. */
function rename(root: HTMLElement, fixture: { detectChanges(): void }, name: string): void {
  const field = [...root.querySelectorAll('input')].find((entry) => entry.value === 'Croissants');
  if (field === undefined) {
    throw new Error('Champ « Nom interne » introuvable.');
  }
  field.value = name;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === text);

describe('PromotionEditorPage', () => {
  it('depuis la fiche d’un site, pré-remplit le retrait à ce point', async () => {
    const { root } = await render({ pickupId: 'pk_coeur' });
    expect(root.textContent).toContain('Nouvelle promotion');
    expect(root.textContent).toContain('Point de retrait');
    // Rien n'est saisi : la forme refuse, le bouton aussi.
    expect(button(root, 'Poser la promotion')?.disabled).toBe(true);
    expect(root.textContent).toContain('Donnez un nom interne');
  });

  /**
   * Régression : une promotion relue sans changement s'enregistrait quand
   * même, et le serveur traçait une révision vide (corrigé le 2026-10-30).
   */
  it('modifie une promotion existante, relue : rien à enregistrer tant qu’elle est inchangée', async () => {
    const { root, fixture } = await render({ id: 'promo_1' });
    expect(root.textContent).toContain('Modifier « Croissants »');
    expect(button(root, 'Enregistrer')?.disabled).toBe(true);
    rename(root, fixture, 'Croissants du matin');
    expect(button(root, 'Enregistrer')?.disabled).toBe(false);
  });

  describe('Enregistrer', () => {
    const inputValues = (root: HTMLElement) =>
      [...root.querySelectorAll('input')].map((entry) => entry.value);

    it('un refus du serveur s’affiche en alerte, sans perdre la saisie ni quitter l’éditeur', async () => {
      const { root, fixture, sent } = await render(
        { id: 'promo_1' },
        {
          revise: () =>
            Promise.reject({ error: { message: 'Elle se dispute « Croissant » avec une autre.' } }),
        },
      );
      rename(root, fixture, 'Croissants du matin');
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(sent.revised).toHaveLength(1);
      expect(root.textContent).toContain('Elle se dispute « Croissant » avec une autre.');
      expect(inputValues(root)).toContain('Croissants du matin');
      expect(TestBed.inject(Router).url).not.toContain('promotions-ciblees');
      // La saisie intacte, on peut renvoyer : le bouton est rendu.
      expect(button(root, 'Enregistrer')?.disabled).toBe(false);
    });

    it('une panne sans message du serveur dit quand même que rien n’est enregistré', async () => {
      const { root, fixture } = await render(
        { id: 'promo_1' },
        {
          revise: () => Promise.reject(new Error('boom')),
        },
      );
      rename(root, fixture, 'Croissants du matin');
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root.textContent).toContain("n'a pas pu être enregistrée");
    });

    it('envoie la promotion modifiée, sans motif inventé, puis ouvre sa fiche', async () => {
      const { root, fixture, sent } = await render({ id: 'promo_1' });
      rename(root, fixture, 'Croissants du matin');
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      expect(sent.revised).toHaveLength(1);
      expect(sent.revised[0]).toMatchObject({ id: 'promo_1', reason: null });
      expect(sent.posed).toEqual([]);
      expect(TestBed.inject(Router).url).toBe('/promotions-ciblees/promo_1');
    });

    it('relue sans changement, un clic ne part nulle part', async () => {
      const { root, fixture, sent } = await render({ id: 'promo_1' });
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      expect(sent.revised).toEqual([]);
    });

    it('une pose vide est refusée par la forme : rien n’est envoyé', async () => {
      const { root, fixture, sent } = await render({});
      button(root, 'Poser la promotion')?.click();
      await fixture.whenStable();
      expect(sent.posed).toEqual([]);
    });
  });
});
