import { TestBed } from '@angular/core/testing';
import type { EditOperationPayload } from '@lfd/pim-contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LibraryPicker, type PickedMedia } from '../../catalogue/library-picker/library-picker';
import { operationView } from '../operation-view.testing';
import { OperationsService } from '../operations.service';
import { PresentationCard } from './presentation-card';

class FakePanels {
  readonly opened: { component: unknown; data: unknown }[] = [];
  result: readonly PickedMedia[] | undefined = undefined;

  open(component: unknown, config: { data?: unknown } = {}): FoldPanelRef {
    this.opened.push({ component, data: config.data });
    const ref = new FoldPanelRef<readonly PickedMedia[]>(1, () => undefined);
    ref.close(this.result);
    return ref;
  }
}

function setup(panels = new FakePanels()) {
  const sent: EditOperationPayload[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelHostService, useValue: panels },
      {
        provide: OperationsService,
        useValue: {
          editPresentation: async (_key: string, payload: EditOperationPayload) => {
            sent.push(payload);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PresentationCard);
  fixture.componentRef.setInput(
    'operation',
    operationView({ image: { url: 'https://cdn/buche.jpg', alt: 'Une bûche' } }),
  );
  fixture.detectChanges();
  return { fixture, card: fixture.componentInstance, sent, panels };
}

describe('PresentationCard', () => {
  it('repart de ce qui est enregistré, même si les clés arrivent dans un autre ordre', () => {
    const { card } = setup();
    expect(card['name']()).toEqual({ fr: 'Noël 2026', en: 'Christmas 2026', it: '' });
    expect(card['changed']()).toBe(false);
  });

  it('n’envoie pas une langue vidée : elle retombe sur le français', async () => {
    const { card, sent } = setup();
    card['setName']('en', '');
    card['setLede']('fr', 'Les bûches arrivent.');
    expect(card['changed']()).toBe(true);
    await card['save']();
    expect(sent[0]).toEqual({
      name: { fr: 'Noël 2026' },
      lede: { fr: 'Les bûches arrivent.' },
      image: { url: 'https://cdn/buche.jpg', alt: 'Une bûche' },
    });
  });

  it('sans nom français, rien ne part', async () => {
    const { card, sent } = setup();
    card['setName']('fr', '  ');
    expect(card['changed']()).toBe(false);
    await card['save']();
    expect(sent).toEqual([]);
  });

  it('choisit UNE image dans la médiathèque, et repart sans texte alternatif', async () => {
    const panels = new FakePanels();
    panels.result = [
      {
        url: 'https://cdn/galette.jpg',
        name: 'Galette',
        width: 800,
        height: 600,
        bytes: 1000,
        contentType: 'image/jpeg',
      },
    ];
    const { card, fixture } = setup(panels);
    card['chooseImage']();
    await fixture.whenStable();
    expect(panels.opened[0]).toEqual({
      component: LibraryPicker,
      data: { already: ['https://cdn/buche.jpg'], single: true },
    });
    expect(card['image']()).toEqual({ url: 'https://cdn/galette.jpg', alt: '' });
  });

  it('retirer l’image est une modification à enregistrer', () => {
    const { card } = setup();
    card['removeImage']();
    expect(card['changed']()).toBe(true);
  });
});
