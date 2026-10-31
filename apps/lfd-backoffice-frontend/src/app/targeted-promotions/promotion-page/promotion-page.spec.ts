import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type {
  PromotionTermsPayload,
  PromotionView,
  PublishedCatalogView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { promotionView } from '../promotion.testing';
import { PromotionsService } from '../promotions.service';
import { PromotionPage } from './promotion-page';

const CATALOGUE: PublishedCatalogView = { shelves: [], entries: [], pendingReview: [] };

@Component({ selector: 'app-stub-fiche', template: '' })
class StubFiche {}

/** Ce que le faux service a reçu — l'écran ne doit rien envoyer qu'on n'ait demandé. */
interface Sent {
  readonly revised: { id: string; terms: PromotionTermsPayload; reason: string | null }[];
  readonly posed: PromotionTermsPayload[];
  readonly archived: string[];
}

interface Setup {
  readonly inputs?: { id?: string; pickupId?: string; from?: string };
  readonly permissions?: readonly StaffPermission[];
  /** La source a basculé (défaut : oui). */
  readonly editable?: boolean;
  readonly get?: () => Promise<PromotionView>;
  readonly catalogue?: () => Promise<PublishedCatalogView>;
  readonly revise?: () => Promise<void>;
  readonly pose?: () => Promise<string>;
  /** Les points actifs ; `null` = la liste ne se lit pas (défaut : Cœur de station). */
  readonly active?: ReadonlyMap<string, string> | null;
}

async function render(setup: Setup = {}) {
  const sent: Sent = { revised: [], posed: [], archived: [] };
  const granted = setup.permissions ?? ['b2b_pricing:read', 'b2b_pricing:write'];
  TestBed.configureTestingModule({
    imports: [PromotionPage],
    providers: [
      provideRouter([{ path: 'promotions-ciblees/:id', component: StubFiche }]),
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      {
        provide: PromotionsService,
        useValue: {
          activePickupNames: async () =>
            setup.active === undefined ? new Map([['pk_coeur', 'Cœur de station']]) : setup.active,
          everySiteName: async () =>
            new Map([
              ['pk_coeur', 'Cœur de station'],
              ['pk_vieux', 'Vieux comptoir'],
            ]),
          zoneNames: async () =>
            new Map([
              ['z_centre', 'Centre'],
              ['z_nord', 'Nord'],
            ]),
          get: setup.get ?? (async () => promotionView({ internalName: 'Croissants' })),
          source: async () => ({
            source: setup.editable === false ? 'legacy' : 'promotions',
            editable: setup.editable !== false,
          }),
          revise: async (id: string, terms: PromotionTermsPayload, reason: string | null) => {
            sent.revised.push({ id, terms, reason });
            await setup.revise?.();
          },
          pose: async (terms: PromotionTermsPayload) => {
            sent.posed.push(terms);
            return (await setup.pose?.()) ?? 'promo_neuve';
          },
          archive: async (_view: PromotionView, reason: string) => {
            sent.archived.push(reason);
          },
        },
      },
      {
        provide: CatalogueService,
        useValue: { published: setup.catalogue ?? (async () => CATALOGUE) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PromotionPage);
  for (const [key, value] of Object.entries(setup.inputs ?? { id: 'promo_1' })) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, fixture, sent };
}

/** Saisit dans le champ qui porte cette valeur, comme au clavier. */
function type(root: HTMLElement, fixture: { detectChanges(): void }, from: string, to: string) {
  const field = [...root.querySelectorAll('input')].find((entry) => entry.value === from);
  if (field === undefined) {
    throw new Error(`Champ « ${from} » introuvable.`);
  }
  field.value = to;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === text);

/**
 * Les champs saisissables. La recherche interne d'un `fold-multiselect` vit
 * dans sa liste, qui ne s'ouvre pas quand le contrôle est désactivé : elle
 * n'en hérite pas l'attribut (vu le 2026-10-31), et n'est pas un champ de la page.
 */
const textInputs = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLInputElement>('input:not([type=checkbox]):not([type=search])'),
];

const typeChoice = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('fold-view-toggle button')].find((entry) =>
    entry.textContent?.includes(label),
  );

describe('PromotionPage', () => {
  describe('le genre de remise se choisit d’abord', () => {
    it('la première carte est le choix du genre, puis la valeur', async () => {
      const { root } = await render({ inputs: {} });
      const text = root.textContent ?? '';
      expect(text.indexOf('Quel genre de remise ?')).toBeGreaterThan(-1);
      expect(text.indexOf('Quel genre de remise ?')).toBeLessThan(
        text.indexOf('Que reçoit le client (valeur de la réduction) ?'),
      );
      expect(typeChoice(root, 'Baisser le prix des articles')?.getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(text).not.toContain('Où joue la promotion');
    });

    it('baisser le prix : ni acheminement, ni montant sur le panier ; tarif négocié proposé', async () => {
      const { root } = await render({ inputs: {} });
      const text = root.textContent ?? '';
      expect(text).not.toContain('Sur quel mode d’acheminement');
      expect(text).toContain('Aussi pour les clients à tarif négocié');
      expect(text).not.toContain('Montant sur le panier');
    });

    it('remise sur le panier : l’acheminement apparaît, le tarif négocié disparaît', async () => {
      const { root, fixture } = await render({ inputs: {} });
      typeChoice(root, 'Remise sur le panier')?.click();
      fixture.detectChanges();
      const text = root.textContent ?? '';
      expect(text).toContain('Sur quel mode d’acheminement');
      expect(text).not.toContain('Aussi pour les clients à tarif négocié');
      expect(text).toContain('Le prix au catalogue ne bouge pas');
    });

    it('un aller-retour ne perd pas ce qui était propre au genre, et le résumé suit', async () => {
      const { root, fixture } = await render({
        get: async () =>
          promotionView({
            effect: { kind: 'fixed_unit_price', value: 120_000 },
            stacksOverMercuriale: true,
          }),
      });
      const before = root.querySelector('fold-callout')?.textContent;
      typeChoice(root, 'Remise sur le panier')?.click();
      fixture.detectChanges();
      expect(root.querySelector('fold-callout')?.textContent).not.toBe(before);
      expect(textInputs(root).some((field) => field.value === '1,2')).toBe(false);
      typeChoice(root, 'Baisser le prix des articles')?.click();
      fixture.detectChanges();
      expect(root.querySelector('fold-callout')?.textContent).toBe(before);
      expect(textInputs(root).some((field) => field.value === '1,2')).toBe(true);
      // Revenue à l'identique : rien à enregistrer.
      expect(button(root, 'Enregistrer')?.disabled).toBe(true);
    });

    it('en lecture seule, le genre se lit et ne se change pas', async () => {
      const { root } = await render({ permissions: ['lfc_site_settings:read'] });
      const choices = [...root.querySelectorAll<HTMLButtonElement>('fold-view-toggle button')];
      expect(choices).toHaveLength(2);
      expect(choices.every((choice) => choice.disabled)).toBe(true);
      expect(root.textContent).toContain('Baisser le prix des articles');
    });
  });

  it('ouvre une promotion directement en champs, avec son résumé en une phrase', async () => {
    const { root } = await render();
    expect(textInputs(root).map((field) => field.value)).toContain('Croissants');
    expect(root.textContent).toContain('−20 % pour tout le monde');
    expect(root.textContent).toContain("quel que soit l'acheminement");
    expect(root.textContent).not.toContain('Modifier');
  });

  it('le résumé suit la saisie', async () => {
    const { root, fixture } = await render();
    type(root, fixture, '20', '15');
    expect(root.textContent).toContain('−15 % pour tout le monde');
  });

  it('depuis la fiche d’un site, pose au retrait à ce point', async () => {
    const { root } = await render({ inputs: { pickupId: 'pk_coeur' } });
    expect(root.textContent).toContain('Nouvelle promotion');
    expect(root.textContent).toContain('au retrait à Cœur de station');
    // Rien n'est saisi : la forme refuse, le bouton aussi.
    expect(button(root, 'Poser la promotion')?.disabled).toBe(true);
    expect(root.textContent).toContain('Donnez un nom interne');
    expect(root.textContent).not.toContain('Où en est-elle ?');
  });

  it('dit la conséquence de l’acheminement pour le client', async () => {
    const atLine = await render();
    expect(atLine.root.textContent).toContain('Le prix de l’article baisse au catalogue');
    TestBed.resetTestingModule();
    const atBasket = await render({
      get: async () =>
        promotionView({
          applicationPoint: 'basket',
          fulfillment: { kind: 'basket', pickup: 'none', delivery: 'all' },
        }),
    });
    expect(atBasket.root.textContent).toContain('Le prix au catalogue ne bouge pas');
  });

  describe('l’acheminement se coche', () => {
    const SET = {
      kind: 'basket',
      pickup: { points: ['pk_coeur', 'pk_vieux'] },
      delivery: { zones: ['z_centre'] },
    } as const;
    const checkbox = (root: HTMLElement, label: string) =>
      [...root.querySelectorAll('fold-checkbox')]
        .find((box) => box.textContent?.includes(label))
        ?.querySelector('input');

    it('dans le prix affiché, aucune case : l’acheminement n’a pas à être choisi', async () => {
      const { root } = await render();
      expect(checkbox(root, 'Retrait')).toBeUndefined();
      expect(checkbox(root, 'Livraison')).toBeUndefined();
    });

    it('montre l’ensemble entier : deux cases cochées, les points et la zone nommés', async () => {
      const { root } = await render({
        get: async () => promotionView({ applicationPoint: 'basket', fulfillment: SET }),
      });
      expect(checkbox(root, 'Retrait')?.checked).toBe(true);
      expect(checkbox(root, 'Livraison')?.checked).toBe(true);
      expect(root.textContent).toContain(
        'au retrait à Cœur de station et Vieux comptoir et en livraison dans la zone Centre',
      );
    });

    it('un point archivé que la promotion garde reste proposé, dit « archivé »', async () => {
      const { fixture } = await render({
        get: async () => promotionView({ applicationPoint: 'basket', fulfillment: SET }),
      });
      const options = fixture.componentInstance['pickupOptions']();
      expect(options).toEqual([
        { value: 'pk_coeur', label: 'Cœur de station' },
        { value: 'pk_vieux', label: 'Vieux comptoir (archivé)' },
      ]);
    });

    it('sans la liste des points actifs, ne dit aucun point archivé à tort', async () => {
      const { fixture } = await render({
        active: null,
        get: async () => promotionView({ applicationPoint: 'basket', fulfillment: SET }),
      });
      expect(fixture.componentInstance['pickupOptions']().map((option) => option.label)).toEqual([
        'Cœur de station',
        'Vieux comptoir',
      ]);
    });

    it('décocher tout est une saisie incomplète, et rien ne s’enregistre', async () => {
      const { root, fixture, sent } = await render({
        get: async () => promotionView({ applicationPoint: 'basket', fulfillment: SET }),
      });
      checkbox(root, 'Retrait')?.click();
      fixture.detectChanges();
      checkbox(root, 'Livraison')?.click();
      fixture.detectChanges();
      expect(root.textContent).toContain('Cochez le retrait, la livraison, ou les deux.');
      expect(button(root, 'Enregistrer')?.disabled).toBe(true);
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      expect(sent.revised).toEqual([]);
    });

    it('« certaines zones » sans zone choisie est incomplet ; une zone ajoutée part avec le reste', async () => {
      const { root, fixture, sent } = await render({
        get: async () => promotionView({ applicationPoint: 'basket', fulfillment: SET }),
      });
      const page = fixture.componentInstance;
      page['setReach']('delivery', { ids: [] });
      fixture.detectChanges();
      expect(root.textContent).toContain('Choisissez au moins une zone de livraison');
      page['setReach']('delivery', { ids: ['z_nord', 'z_centre'] });
      fixture.detectChanges();
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      expect(sent.revised[0]?.terms.fulfillment).toEqual({
        kind: 'basket',
        pickup: { points: ['pk_coeur', 'pk_vieux'] },
        delivery: { zones: ['z_centre', 'z_nord'] },
      });
    });

    it('une copie pour un autre public recopie l’ensemble entier', async () => {
      const { root, fixture, sent } = await render({
        inputs: { from: 'promo_1' },
        get: async () => promotionView({ applicationPoint: 'basket', fulfillment: SET }),
      });
      expect(checkbox(root, 'Retrait')?.checked).toBe(true);
      expect(checkbox(root, 'Livraison')?.checked).toBe(true);
      checkbox(root, 'Tout le monde')?.click();
      fixture.detectChanges();
      button(root, 'Poser la promotion')?.click();
      await fixture.whenStable();
      expect(sent.posed[0]?.fulfillment).toEqual(SET);
    });
  });

  describe('sans le droit d’écrire', () => {
    it('montre les mêmes champs, désactivés, sans rien à enregistrer ni geste', async () => {
      const { root } = await render({ permissions: ['lfc_site_settings:read'] });
      const fields = textInputs(root);
      expect(fields.map((field) => field.value)).toContain('Croissants');
      expect(fields.every((field) => field.disabled)).toBe(true);
      expect(button(root, 'Enregistrer')).toBeUndefined();
      expect(button(root, 'Mettre en pause')).toBeUndefined();
      expect(root.textContent).not.toContain('Donnez un nom');
    });

    it('lit même sans catalogue : les cibles portées restent nommées', async () => {
      const { root } = await render({
        permissions: ['lfc_site_settings:read'],
        catalogue: () => Promise.reject(new Error('403')),
      });
      expect(root.textContent).toContain('Le catalogue publié ne se lit pas');
      expect(root.textContent).toContain('seulement sur Croissant');
    });
  });

  it('avant la bascule de la source, désactive tout, même avec le droit', async () => {
    const { root } = await render({ editable: false });
    expect(textInputs(root).every((field) => field.disabled)).toBe(true);
    expect(button(root, 'Enregistrer')).toBeUndefined();
  });

  it('une archivée se lit en champs désactivés, avec son motif, sans geste', async () => {
    const { root } = await render({
      get: async () =>
        promotionView({
          state: 'archived',
          archived: { at: '2026-11-02T10:00:00.000Z', by: 'staff', reason: 'fin de saison' },
        }),
    });
    expect(root.textContent).toContain('« fin de saison »');
    expect(textInputs(root).every((field) => field.disabled)).toBe(true);
    expect(button(root, 'Enregistrer')).toBeUndefined();
    expect(button(root, 'Archiver')).toBeUndefined();
  });

  it('une panne se dit en alerte', async () => {
    const { root } = await render({
      get: async () => {
        throw new Error('réseau');
      },
    });
    expect(root.textContent).toContain('Promotion illisible');
  });

  describe('Enregistrer', () => {
    /**
     * Régression : une promotion relue sans changement s'enregistrait quand
     * même, et le serveur traçait une révision vide (corrigé le 2026-10-30).
     */
    it('relue sans changement, rien à enregistrer ; un clic ne part nulle part', async () => {
      const { root, fixture, sent } = await render();
      expect(button(root, 'Enregistrer')?.disabled).toBe(true);
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      expect(sent.revised).toEqual([]);
    });

    it('enregistre une révision avec son motif, et reste sur la page', async () => {
      const { root, fixture, sent } = await render();
      type(root, fixture, 'Croissants', 'Croissants du matin');
      const reason = [...root.querySelectorAll('fold-input')]
        .find((field) => field.textContent?.includes('Motif de la modification'))
        ?.querySelector('input');
      if (!reason) {
        throw new Error('Champ « Motif » introuvable.');
      }
      reason.value = 'nouvelle saison';
      reason.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      expect(sent.revised).toHaveLength(1);
      expect(sent.revised[0]).toMatchObject({ id: 'promo_1', reason: 'nouvelle saison' });
      expect(sent.revised[0]?.terms.internalName).toBe('Croissants du matin');
      expect(sent.posed).toEqual([]);
    });

    it('un refus du serveur s’affiche en alerte, sans perdre la saisie', async () => {
      const { root, fixture, sent } = await render({
        revise: () =>
          Promise.reject({ error: { message: 'Elle se dispute « Croissant » avec une autre.' } }),
      });
      type(root, fixture, 'Croissants', 'Croissants du matin');
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(sent.revised).toHaveLength(1);
      expect(root.textContent).toContain('Elle se dispute « Croissant » avec une autre.');
      expect(textInputs(root).map((field) => field.value)).toContain('Croissants du matin');
      expect(button(root, 'Enregistrer')?.disabled).toBe(false);
    });

    it('une panne sans message du serveur dit quand même que rien n’est enregistré', async () => {
      const { root, fixture } = await render({ revise: () => Promise.reject(new Error('boom')) });
      type(root, fixture, 'Croissants', 'Croissants du matin');
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root.textContent).toContain("n'a pas pu être enregistrée");
    });

    it('une pose vide est refusée par la forme : rien n’est envoyé', async () => {
      const { root, fixture, sent } = await render({ inputs: {} });
      button(root, 'Poser la promotion')?.click();
      await fixture.whenStable();
      expect(sent.posed).toEqual([]);
      expect(TestBed.inject(Router).url).not.toContain('promotions-ciblees');
    });
  });

  it('garde ses gestes sur la même page : pause, et archivage avec le motif — pas sans', async () => {
    const { root, fixture, sent } = await render();
    expect(button(root, 'Mettre en pause')).toBeDefined();
    expect(button(root, 'Archiver')?.disabled).toBe(true);
    const motive = [...root.querySelectorAll('fold-input')]
      .find((field) => field.textContent?.includes('Motif du geste'))
      ?.querySelector('input');
    if (!motive) {
      throw new Error('Champ « Motif du geste » introuvable.');
    }
    motive.value = 'fin de saison';
    motive.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button(root, 'Archiver')?.click();
    await fixture.whenStable();
    expect(sent.archived).toEqual(['fin de saison']);
  });

  describe('Dupliquer pour un autre public', () => {
    it('s’offre sur une promotion existante, sous le droit d’écrire seulement', async () => {
      const writer = await render();
      const link = [...writer.root.querySelectorAll('a')].find((a) =>
        a.textContent?.includes('Dupliquer pour un autre public'),
      );
      expect(link?.getAttribute('href')).toBe('/promotions-ciblees/nouvelle?from=promo_1');
      TestBed.resetTestingModule();
      const reader = await render({ permissions: ['b2b_pricing:read'] });
      expect(reader.root.textContent).not.toContain('Dupliquer');
    });

    it('ouvre une pose préremplie de tout, sauf le public — rien n’est posé ni modifié', async () => {
      const { root, sent } = await render({ inputs: { from: 'promo_1' } });
      expect(root.textContent).toContain('Nouvelle promotion');
      expect(root.textContent).toContain('Copie de « Croissants »');
      expect(textInputs(root).map((field) => field.value)).toEqual(
        expect.arrayContaining(['Croissants (copie à revoir)', '20', '−20 % sur le croissant']),
      );
      expect(root.textContent).toContain('pour un public à choisir');
      expect(root.textContent).toContain('Cochez au moins un public');
      expect(button(root, 'Poser la promotion')?.disabled).toBe(true);
      expect(sent).toEqual({ revised: [], posed: [], archived: [] });
    });

    it('un recouvrement refusé par le serveur se lit tel quel, rivale nommée', async () => {
      const { root, fixture, sent } = await render({
        inputs: { from: 'promo_1' },
        pose: () =>
          Promise.reject({
            error: { message: 'Elle recouvre « Croissants » pour le même public.' },
          }),
      });
      const everyone = [...root.querySelectorAll('fold-checkbox')]
        .find((box) => box.textContent?.includes('Tout le monde'))
        ?.querySelector('input');
      everyone?.click();
      fixture.detectChanges();
      button(root, 'Poser la promotion')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(sent.posed).toHaveLength(1);
      expect(sent.revised).toEqual([]);
      expect(root.textContent).toContain('Elle recouvre « Croissants » pour le même public.');
    });
  });

  describe('Sur quels articles ? — une ligne par famille', () => {
    const counts = {
      inactif: 0,
      en_vente: 0,
      masque: 0,
      pas_vendu: 0,
      en_attente_validation: 0,
      incomplet: 0,
    };
    const shelf = (categoryId: string, name: string) => ({
      categoryId,
      name,
      position: 0,
      withdrawn: false,
      pro: counts,
      public: counts,
    });
    const entry = (
      productId: string,
      categoryId: string,
      skus: readonly [string, string][],
    ): PublishedCatalogView['entries'][number] => ({
      productId,
      productSku: productId,
      name: productId,
      categoryId,
      status: 'active',
      audience: 'both',
      audienceInherited: true,
      familyAudience: null,
      receivedAt: '2026-10-30T10:00:00.000Z',
      variants: skus.map(([sku, name]) => ({
        sku,
        name,
        onSale: true,
        isDefault: true,
        gaps: [],
        reviewPending: { pro: false, public: false },
        pro: { state: 'en_vente', htMillicents: null },
        public: { state: 'en_vente', ttcCents: null },
      })),
    });
    const PUBLISHED: PublishedCatalogView = {
      shelves: [shelf('c_choc', 'Chocolaterie'), shelf('c_vien', 'Viennoiserie')],
      entries: [
        entry('p_noir', 'c_choc', [['N70-1', 'Noir 70 %']]),
        entry('p_lait', 'c_choc', [['L-1', 'Lait']]),
        entry('p_croi', 'c_vien', [['CR-1', 'Croissant']]),
      ],
      pendingReview: [],
    };
    const scoped = (permissions?: readonly StaffPermission[]) =>
      render({
        ...(permissions === undefined ? {} : { permissions }),
        catalogue: async () => PUBLISHED,
        get: async () =>
          promotionView({
            scope: {
              mode: 'all_except',
              rules: [
                { target: 'category', targetId: 'c_choc', eligible: false, name: 'Chocolaterie' },
                { target: 'variant', targetId: 'N70-1', eligible: true, name: 'Noir 70 %' },
              ],
            },
          }),
      });

    it('montre la famille exclue, son compte et son « Sauf », le compteur et le résumé', async () => {
      const { root } = await scoped();
      const text = root.textContent ?? '';
      const line = [...root.querySelectorAll('fold-card fold-card')].find((card) =>
        card.textContent?.includes('Chocolaterie'),
      );
      expect(line?.textContent).toContain('Exclue · 1 déclinaison concernée');
      expect(line?.textContent).toContain('Sauf — à réintégrer');
      expect(line?.textContent).toContain('Noir 70 %');
      expect(text).toContain('2 déclinaisons concernées sur 3');
      expect(text).toContain('sur tout sauf Chocolaterie (hors Noir 70 % · N70-1)');
      expect(button(line as HTMLElement, 'Retirer')).toBeDefined();
      expect(root.querySelector('fold-listbox[label="Ajouter une famille"]')).not.toBeNull();
      expect(text).toContain('Articles à part');
    });

    it('en lecture seule, la ligne se lit sans geste', async () => {
      const { root } = await scoped(['lfc_site_settings:read']);
      expect(root.textContent).toContain('Exclue · 1 déclinaison concernée');
      expect(button(root, 'Retirer')).toBeUndefined();
      expect(root.querySelector('fold-listbox[label="Ajouter une famille"]')).toBeNull();
    });
  });
});
