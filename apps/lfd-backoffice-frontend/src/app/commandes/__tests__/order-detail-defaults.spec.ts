import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OrderDetail, type OrderEntryStep, orderDocuments } from '@lfd/b2b-ui/order';
import type { CustomerOrderLineView, CustomerOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { adminOrder } from './admin-order-fixture';

/**
 * **Le détail partagé, tel que la boutique le monte.** Le back-office tait son
 * en-tête et sort ses documents ; la boutique ne règle ni l'un ni l'autre, et
 * doit garder les deux — ses nouveaux réglages ont pour défaut ce qu'elle voyait.
 *
 * Éprouvé ici et non dans `@lfd/b2b-ui` : sa suite jest tourne sous Node, sans
 * rendu Angular.
 */
/** Un hôte staff qui projette sous la composition, comme `order-view`. */
@Component({
  imports: [OrderDetail],
  template: `<lfd-order-detail audience="staff" [order]="order">
    <p belowComposition data-below>sous la composition</p>
  </lfd-order-detail>`,
})
class StaffHost {
  protected readonly order = adminOrder();
}

/** L'hôte staff complet : cartes, badge de ligne, détail des limites sous le tableau. */
@Component({
  imports: [OrderDetail],
  template: `<lfd-order-detail
    audience="staff"
    [order]="order"
    [framed]="true"
    [lineBadges]="badges"
  >
    <p belowLines data-limits>limites</p>
  </lfd-order-detail>`,
})
class FramedHost {
  protected readonly order: CustomerOrderView = {
    ...adminOrder(),
    lines: [
      {
        sku: 'PAIN-LEV',
        productName: 'Pain au levain',
        unitPriceMillicents: 400_000,
        vatRate: 5.5,
        quantity: 2,
        saleUnit: 'piece',
        lineTotalCents: 800,
        pricing: null,
        allergens: null,
      },
    ],
  };
  protected readonly badges: ReadonlyMap<string, string> = new Map([['PAIN-LEV', 'hors délai']]);
}

interface Settings {
  readonly showHead?: boolean;
  readonly showDocuments?: boolean;
  readonly audience?: 'client' | 'staff';
  readonly entryStep?: OrderEntryStep;
  readonly framed?: boolean;
}

function render(settings: Settings = {}) {
  const order = adminOrder();
  const fixture = TestBed.createComponent(OrderDetail);
  fixture.componentRef.setInput('order', order);
  fixture.componentRef.setInput('documents', orderDocuments(order));
  if (settings.showHead !== undefined) {
    fixture.componentRef.setInput('showHead', settings.showHead);
  }
  if (settings.showDocuments !== undefined) {
    fixture.componentRef.setInput('showDocuments', settings.showDocuments);
  }
  if (settings.audience !== undefined) {
    fixture.componentRef.setInput('audience', settings.audience);
  }
  if (settings.entryStep !== undefined) {
    fixture.componentRef.setInput('entryStep', settings.entryStep);
  }
  if (settings.framed !== undefined) {
    fixture.componentRef.setInput('framed', settings.framed);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('lfd-order-detail — les défauts de la boutique', () => {
  it('garde son en-tête : la référence, les deux badges et le montant', () => {
    const el = render();
    const head = el.querySelector('lfd-order-detail-head');
    expect(head?.querySelector('.od-number')?.textContent).toContain('ORD-9');
    expect(head?.querySelectorAll('fold-badge')).toHaveLength(2);
    expect(head?.querySelector('.od-total-label')?.textContent).toContain('HT');
  });

  it('garde au rail la place de ses actions (le slot `actions`)', () => {
    expect(render().querySelector('[asideRight] .od-actions')).not.toBeNull();
  });

  it('garde ses documents au rail', () => {
    const el = render();
    const list = el.querySelector('lfd-order-documents-list');
    expect(list?.textContent).toContain('Confirmation de commande');
    expect(list?.textContent).toContain('Facture');
  });

  it('les tait quand le back-office le demande', () => {
    const el = render({ showHead: false, showDocuments: false });
    expect(el.querySelector('lfd-order-detail-head')).toBeNull();
    expect(el.querySelector('lfd-order-documents-list')).toBeNull();
    // Le corps, lui, reste : la frise et la composition.
    expect(el.querySelector('fold-timeline')).not.toBeNull();
  });

  it('n’a pas d’étape « qui a pris la commande » dans l’avancement de la boutique', () => {
    const el = render({
      entryStep: { label: 'Prise par le commercial', detail: 'saisie par Hugo H' },
    });
    expect(el.querySelector('fold-timeline')?.textContent).not.toContain('Prise par le commercial');
  });

  it('côté staff, « qui a pris la commande » ouvre l’avancement', () => {
    const el = render({
      audience: 'staff',
      entryStep: { label: 'Prise par le commercial', detail: 'saisie par Hugo H' },
    });
    const first = el.querySelector('fold-timeline .od-node');
    expect(first?.textContent).toContain('Prise par le commercial');
    // Qui l'a saisie : sur la ligne en dessous, pas dans le titre.
    expect(first?.nextElementSibling?.classList).toContain('od-node-detail');
    expect(first?.nextElementSibling?.textContent).toContain('saisie par Hugo H');
  });

  it('n’ajoute rien sous la composition sans projection', () => {
    const lines = render().querySelector('.od-lines');
    expect(lines?.lastElementChild?.tagName.toLowerCase()).toBe('table');
  });

  it('côté staff, ce qui est projeté se range dans la colonne du milieu, sous la composition', () => {
    const fixture = TestBed.createComponent(StaffHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const below = el.querySelector('.od-lines > [data-below]');
    expect(below).not.toBeNull();
    expect(below?.previousElementSibling?.tagName.toLowerCase()).toBe('table');
  });

  describe('la cellule « Article »', () => {
    function line(steps: readonly string[]): CustomerOrderLineView {
      return {
        sku: `SKU-${steps.length}`,
        productName: 'Croissant au beurre',
        unitPriceMillicents: 100_000,
        vatRate: 5.5,
        quantity: 12,
        saleUnit: 'piece',
        lineTotalCents: 1_200,
        pricing: {
          basePriceMillicents: 120_000,
          steps: steps.map((label) => ({ label })),
          floored: false,
        },
        allergens: null,
      };
    }

    function cell(steps: readonly string[], selectable: boolean): Element | null {
      const order: CustomerOrderView = { ...adminOrder(), lines: [line(steps)] };
      const fixture = TestBed.createComponent(OrderDetail);
      fixture.componentRef.setInput('order', order);
      fixture.componentRef.setInput('selectableLines', selectable);
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelector('.od-article');
    }

    /** Les lignes de la cellule, par leur marque `data-article-*`. */
    const kinds = (article: Element | null | undefined): readonly string[] =>
      [...(article?.children ?? [])].map(
        (row) =>
          [...row.attributes]
            .map((attr) => attr.name)
            .find((name) => name.startsWith('data-article-'))
            ?.replace('data-article-', '') ?? '?',
      );

    it('empile le nom, le SKU, puis la remise, puis « pourquoi ce prix ? »', () => {
      const article = cell(['Remise La Folie Coffee'], true);
      expect(kinds(article)).toEqual(['name', 'sku', 'discount', 'why']);
      expect(article?.querySelector('[data-article-name]')?.textContent).toContain(
        'Croissant au beurre',
      );
      expect(article?.querySelector('[data-article-sku]')?.textContent).toContain('SKU-1');
      expect(article?.querySelector('[data-article-discount]')?.textContent).toContain(
        'Remise La Folie Coffee',
      );
    });

    it('sans remise, aucune ligne vide : le nom, le SKU, puis le lien', () => {
      expect(kinds(cell([], true))).toEqual(['name', 'sku', 'why']);
    });

    it('côté boutique (sans explication), le nom et son SKU seulement', () => {
      expect(kinds(cell([], false))).toEqual(['name', 'sku']);
    });
  });

  describe('côté staff, en cartes (`framed`)', () => {
    function framed(): HTMLElement {
      const fixture = TestBed.createComponent(FramedHost);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('met la composition dans une carte fold', () => {
      const card = framed().querySelector('.od-lines fold-card[data-composition-card]');
      expect(card?.querySelector('table')).not.toBeNull();
    });

    it('pose le badge « hors délai » sur la ligne, et le détail juste sous le tableau', () => {
      const el = framed();
      expect(el.querySelector('tr [data-article-name] [data-line-badge]')?.textContent).toContain(
        'hors délai',
      );
      expect(el.querySelector('fold-card[data-composition-card] + [data-limits]')).not.toBeNull();
    });

    it('un seul style de titre : `lfd-section-title`, celui de « Avancement », pour chaque bloc', () => {
      const el = framed();
      expect(el.querySelector('fold-element-title')).toBeNull();
      expect(el.querySelector('.od-h3')).toBeNull();
      const titles = [...el.querySelectorAll('lfd-section-title')].map((t) =>
        t.textContent?.trim(),
      );
      expect(titles).toEqual(
        expect.arrayContaining(['Avancement', 'Composition', 'Montants', 'Acheminement']),
      );
    });
  });

  it('la boutique garde ses sections, sans carte ni badge de ligne, sous le même intitulé', () => {
    const el = render();
    expect(el.querySelector('lfd-section-title #od-lines-title')?.textContent).toContain(
      'Composition',
    );
    expect(el.querySelector('fold-card')).toBeNull();
    expect(el.querySelector('[data-line-badge]')).toBeNull();
  });

  it('la boutique n’a aucune bascule de place', () => {
    const el = render();
    expect(el.querySelector('[data-rail-switch]')).toBeNull();
    expect(el.querySelector('[data-pane-switch]')).toBeNull();
    expect(el.querySelector('article.od')?.hasAttribute('data-pane-view')).toBe(false);
  });

  it('côté staff, la page s’ouvre sur la composition, et les deux bascules existent', () => {
    const el = render({ audience: 'staff', framed: true });
    expect(el.querySelector('article.od')?.getAttribute('data-pane-view')).toBe('composition');
    // Une seule colonne : Composition / Infos / Avancement.
    expect(el.querySelector('[data-pane-switch]')).not.toBeNull();
    // Tablette paysage : la colonne de droite, Infos / Avancement.
    expect(el.querySelector('.od-side [data-rail-switch]')).not.toBeNull();
    // Les infos (dont l'annulation projetée) forment un seul groupe que la bascule tait.
    expect(el.querySelector('.od-side .od-side-info')).not.toBeNull();
    expect(el.querySelector('.od-progress fold-timeline')).not.toBeNull();
  });
});
