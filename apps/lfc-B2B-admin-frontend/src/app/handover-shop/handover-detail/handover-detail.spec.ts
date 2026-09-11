import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, OrderHandoverLine, OrderHandoverView } from '@lfd/contracts';

import { HandoverQueueService } from '../handover-queue.service';
import { HandoverDetail } from './handover-detail';

/**
 * Ce que ces cas tiennent :
 *
 * - **le rail montre ce qu'il y a dans le sac** — il charge la commande à la
 *   sélection, parce que la file ne porte aucune ligne de marchandise ;
 * - 🔴 **sans sélection il reste là**, et le dit — c'est tout l'objet du rail
 *   permanent : la file ne se réorganise pas sous les doigts au premier clic ;
 * - 🔴 **changer de ligne ne garde pas les articles de la précédente** — la
 *   façon la plus simple de tendre le mauvais sac ;
 * - **une lecture ratée n'emporte pas le bon de commande** : le rail le dit, et
 *   le bon reste atteignable ;
 * - 🔴 **la liste n'a plus de dépliage** : tout ce qu'on tend est à l'écran,
 *   d'un coup — un « + 2 références » demandait un clic pour voir le sac ;
 * - 🔴 **une annulation est annoncée**, pour qu'on puisse l'expliquer à qui se
 *   présente, et le geste de remise disparaît ;
 * - 🔴 **aucune heure n'est inventée** quand aucune tranche n'a été demandée ;
 * - 🔴 **le scan part du rail mais ne s'y ouvre pas** : il nomme la commande
 *   visée et laisse l'écran ouvrir le panneau ;
 * - 🔴 **la remise saisie dit qu'elle est saisie** — « sans code », parce
 *   qu'une attestation faible et honnête vaut mieux qu'une forte et fausse.
 */

const DAY = '2026-09-10';

function entry(over: Partial<HandoverQueueEntryView> = {}): HandoverQueueEntryView {
  return {
    orderId: 'ord_1',
    reference: 'CMD-1042',
    customerLabel: 'Boulangerie Marin',
    tradeName: null,
    pickupLabel: 'Laboratoire',
    fulfillmentMethod: 'pickup',
    window: { start: '06:00', end: '08:00', source: 'default' },
    totalUnits: 12,
    placedAt: `${DAY}T05:00:00.000Z`,
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    ...over,
  };
}

function line(over: Partial<OrderHandoverLine> = {}): OrderHandoverLine {
  return {
    sku: 'CROI-NAT',
    productName: 'Croissant nature',
    quantity: 12,
    ...over,
  };
}

/**
 * **Un seul doublé depuis le 2026-09-11**, et c'est le sujet du changement.
 *
 * 🔴 Le rail lisait sa commande par `AdminOrdersService.byId()`, qui rend
 * l'`OrderView` du CLIENT — prix unitaires, TVA, totaux, trace de négociation.
 * Il la lit maintenant dans la vue de la remise, où aucun montant n'existe. Le
 * doublé de commerce n'a donc plus de raison d'être ici : le rail ne parle plus
 * qu'au service de la file.
 *
 * Le fixture le montre au passage — il n'y a plus un prix à écrire dedans.
 */
class FakeHandovers {
  lines: readonly OrderHandoverLine[] = [line()];
  fails = false;
  readonly remitted: string[] = [];

  byOrderId(orderId: string): Promise<OrderHandoverView> {
    if (this.fails) {
      return Promise.reject(new Error('injoignable'));
    }
    return Promise.resolve({
      orderId,
      orderNumber: 'CMD-1042',
      customerLabel: 'Boulangerie Marin',
      placedAt: `${DAY}T05:00:00.000Z`,
      requestedDeliveryDate: DAY,
      pickupLabel: 'Laboratoire',
      fulfillmentMethod: 'pickup',
      note: '',
      totalUnits: this.lines.reduce((sum, row) => sum + row.quantity, 0),
      lines: this.lines,
      handedOverAt: null,
      handedOverBy: null,
      handedOverVia: null,
      blockedReason: null,
    });
  }

  confirmManually(reference: string): Promise<Pick<OrderHandoverView, 'orderNumber'>> {
    this.remitted.push(reference);
    return Promise.resolve({ orderNumber: reference });
  }
}

interface Doubles {
  readonly handovers: FakeHandovers;
}

async function render(
  selected: HandoverQueueEntryView | null,
  doubles: Doubles = { handovers: new FakeHandovers() },
): Promise<ComponentFixture<HandoverDetail>> {
  TestBed.configureTestingModule({
    imports: [HandoverDetail],
    providers: [{ provide: HandoverQueueService, useValue: doubles.handovers }],
  });
  const fixture: ComponentFixture<HandoverDetail> = TestBed.createComponent(HandoverDetail);
  fixture.componentRef.setInput('entry', selected);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<HandoverDetail>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const buttonSaying = (
  fixture: ComponentFixture<HandoverDetail>,
  label: string,
): HTMLElement | null =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(label),
  ) ?? null;

describe('HandoverDetail', () => {
  it('montre ce qu’il y a dans le sac', async () => {
    const fixture = await render(entry());

    expect(text(fixture)).toContain('Croissant nature');
    expect(text(fixture)).toContain('CROI-NAT');
    expect(text(fixture)).toContain('Boulangerie Marin');
    expect(text(fixture)).toContain('CMD-1042');
  });

  it('🔴 sans sélection, le rail est là et le dit', async () => {
    const fixture = await render(null);

    expect(text(fixture)).toContain('Aucune commande choisie');
    // Et surtout : rien d'un sac précédent.
    expect(text(fixture)).not.toContain('Croissant nature');
  });

  it('🔴 changer de ligne n’emporte pas les articles de la précédente', async () => {
    const handovers = new FakeHandovers();
    const fixture = await render(entry(), { handovers });
    expect(text(fixture)).toContain('Croissant nature');

    handovers.lines = [line({ sku: 'PAIN-COMP', productName: 'Pain complet' })];
    fixture.componentRef.setInput('entry', entry({ orderId: 'ord_2', reference: 'CMD-1043' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Pain complet');
    expect(text(fixture)).not.toContain('Croissant nature');
  });

  it('🔴 l’enseigne passe DEVANT la raison sociale, et les deux sont là', async () => {
    const fixture = await render(entry({ tradeName: 'La Folie Douce' }));

    expect(text(fixture)).toContain('La Folie Douce');
    expect(text(fixture)).toContain('Boulangerie Marin');
  });

  it('🔴 sans enseigne, le nom n’est écrit QU’UNE fois', async () => {
    // Régression de conception : deux noms identiques l'un sous l'autre se
    // lisent comme deux clients homonymes le temps d'un regard. Le serveur rend
    // `null` quand l'enseigne ne dirait rien de plus — l'écran ne recompose pas
    // la règle, il compte sur elle.
    const fixture = await render(entry());

    const shown = text(fixture).split('Boulangerie Marin').length - 1;
    expect(shown).toBe(1);
  });

  it('🔴 sans tranche demandée, ne montre AUCUNE heure', async () => {
    const fixture = await render(entry({ window: null }));

    expect(text(fixture)).toContain('aucune tranche demandée');
    expect(text(fixture)).not.toContain('h\u00a000');
  });

  it('🔴 une annulation est annoncée, et rien ne peut être remis', async () => {
    const fixture = await render(entry({ state: 'cancelled' }));

    expect(text(fixture)).toContain('Cette commande est annulée');
    expect(buttonSaying(fixture, 'Remettre')).toBeNull();
  });

  it('🔴 une commande déjà remise ne se remet pas une seconde fois', async () => {
    const fixture = await render(
      entry({ state: 'handed_over', handedOverAt: `${DAY}T06:41:00.000Z`, handedOverVia: 'scan' }),
    );

    expect(text(fixture)).toContain('Le sac est parti');
    expect(buttonSaying(fixture, 'Remettre')).toBeNull();
  });

  it('🔴 le scan sort du rail sans l’ouvrir, et nomme la commande visée', async () => {
    // Le rail dit sur QUI on veut lire, l'écran ouvre : deux surfaces qui
    // ouvriraient chacune leur panneau en donneraient deux au double-clic, et
    // seule celle du dessus relirait la file en se fermant.
    const fixture = await render(entry());
    const asked: HandoverQueueEntryView[] = [];
    fixture.componentInstance.scanned.subscribe((row) => asked.push(row));

    buttonSaying(fixture, 'Scanner')?.click();
    await fixture.whenStable();

    expect(asked.map((row) => row.reference)).toEqual(['CMD-1042']);
  });

  it('🔴 une commande déjà remise n’offre plus de scan non plus', async () => {
    const fixture = await render(
      entry({ state: 'handed_over', handedOverAt: `${DAY}T06:41:00.000Z`, handedOverVia: 'scan' }),
    );

    expect(buttonSaying(fixture, 'Scanner')).toBeNull();
  });

  it('🔴 la remise saisie dit qu’elle est SANS CODE, et part sur le numéro', async () => {
    const handovers = new FakeHandovers();
    const fixture = await render(entry(), { handovers });

    const remit = buttonSaying(fixture, 'Remettre sans code');
    expect(remit).not.toBeNull();
    remit?.click();
    await fixture.whenStable();

    expect(handovers.remitted).toEqual(['CMD-1042']);
  });

  it('🔴 toute la liste est à l’écran, sans dépliage à cliquer', async () => {
    // Régression : la liste se repliait au-delà de cinq lignes derrière un
    // « + N références ». Un clic pour voir ce qu'on est en train de tendre est
    // un clic de trop, et il repoussait la remise à chaque ouverture.
    const handovers = new FakeHandovers();
    handovers.lines = [
      line({ sku: 'A', productName: 'Un' }),
      line({ sku: 'B', productName: 'Deux' }),
      line({ sku: 'C', productName: 'Trois' }),
      line({ sku: 'D', productName: 'Quatre' }),
      line({ sku: 'E', productName: 'Cinq' }),
      line({ sku: 'F', productName: 'Six' }),
    ];

    const fixture = await render(entry(), { handovers });

    expect(text(fixture)).toContain('Six');
    expect(text(fixture)).not.toContain('référence');
  });

  it('une lecture ratée le dit et laisse le bon accessible', async () => {
    const handovers = new FakeHandovers();
    handovers.fails = true;

    const fixture = await render(entry(), { handovers });

    expect(text(fixture)).toContain('Contenu illisible');
    expect(buttonSaying(fixture, 'Voir le bon')).not.toBeNull();
  });

  it('🔴 le rail ne parle QU’AU service de la file', async () => {
    // Régression de conception (2026-09-11) : il lisait sa commande par
    // `AdminOrdersService.byId()`, donc l'`OrderView` du CLIENT — prix, TVA,
    // totaux, trace de négociation — sur un poste de comptoir. Ce cas tient la
    // frontière par l'INJECTION : `render` ne fournit pas le service de
    // commerce, donc un rail qui recommencerait à le demander échouerait ici
    // au lieu de repartir chercher des montants en silence.
    const fixture = await render(entry());

    expect(text(fixture)).toContain('Croissant nature');
    expect(buttonSaying(fixture, 'Voir le bon')).not.toBeNull();
  });
});
