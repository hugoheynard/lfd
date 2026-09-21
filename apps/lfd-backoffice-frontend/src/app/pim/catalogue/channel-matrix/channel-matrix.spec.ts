import { TestBed } from '@angular/core/testing';
import type { PointOfSaleView } from '@lfd/pim-contracts';

import { provideTestSalesContexts } from '../../sales-contexts/sales-context-store.testing';
import type { SalesChannels } from '../../data/models';
import { ChannelMatrix } from './channel-matrix';

const CHANNELS: SalesChannels = [
  { pointOfSaleId: 'emp_village', context: 'takeaway' },
  { pointOfSaleId: 'emp_village', context: 'eatIn' },
  { pointOfSaleId: 'emp_val', context: 'takeaway' },
];

/**
 * Les points de vente sont une DONNÉE : la grille en reçoit la liste, ce
 * qu'ils OFFRENT compris. « Val » ne sert pas en salle — sa case « Sur place »
 * ne doit donc pas exister.
 */
const POINTS_OF_SALE: PointOfSaleView[] = [
  {
    id: 'pos_b2b',
    kind: 'platform',
    label: 'B2B',
    baseUrl: null,
    contexts: ['b2b'],
    tables: [],
    usedByCategories: 0,
    root: true,
  },
  {
    id: 'emp_village',
    kind: 'shop',
    label: 'Village',
    baseUrl: '',
    contexts: ['takeaway', 'eatIn'],
    tables: [],
    usedByCategories: 0,
    root: false,
  },
  {
    id: 'emp_val',
    kind: 'shop',
    label: 'Val',
    baseUrl: '',
    contexts: ['takeaway'],
    tables: [],
    usedByCategories: 0,
    root: false,
  },
];

function render(
  inherited: boolean,
  pointsOfSale: PointOfSaleView[] = POINTS_OF_SALE,
  unreadable: string | null = null,
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideTestSalesContexts()] });
  const fixture = TestBed.createComponent(ChannelMatrix);
  fixture.componentRef.setInput('channels', CHANNELS);
  fixture.componentRef.setInput('pointsOfSale', pointsOfSale);
  fixture.componentRef.setInput('unreadable', unreadable);
  fixture.componentRef.setInput('inherited', inherited);
  fixture.detectChanges();
  return fixture;
}

function checkboxLabels(fixture: ReturnType<typeof render>): string[] {
  return [...fixture.nativeElement.querySelectorAll('[aria-label]')].map(
    (element) => (element as HTMLElement).getAttribute('aria-label') ?? '',
  );
}

describe('ChannelMatrix', () => {
  it('shows the inherited badge and no revert control when inherited', () => {
    const text = render(true).nativeElement.textContent ?? '';
    expect(text).toContain('Hérité de la gamme');
    expect(text).not.toContain('Revenir au défaut');
  });

  it('exposes a revert control when personnalisé, and emits on click', () => {
    const fixture = render(false);
    let reverted = false;
    fixture.componentInstance.revert.subscribe(() => (reverted = true));

    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(button?.textContent).toContain('Revenir au défaut');

    button?.click();
    expect(reverted).toBe(true);
  });

  it('rend une ligne par point de vente RÉEL, la plateforme comprise', () => {
    // C'étaient deux lignes en dur, dont l'une nommait « Ardroit » — une
    // boutique absente de la base. Puis les emplacements sont devenus une
    // donnée, mais le B2B restait une case à part, en pied de grille.
    const text = render(true).nativeElement.textContent ?? '';

    expect(text).toContain('Village');
    expect(text).toContain('Val');
    expect(text).toContain('B2B');
  });

  /**
   * Le cœur du modèle : l'offre borne les cases cochables. Vendre « sur place »
   * depuis une boutique sans salle produisait une fiche pour un lieu qui ne
   * sert pas — le serveur le refuse, la grille ne le propose donc plus.
   */
  it("n'offre pas de case là où le point de vente n'offre pas le contexte", () => {
    const labels = checkboxLabels(render(true));

    expect(labels).toContain('Village — Sur place');
    expect(labels).not.toContain('Val — Sur place');
    expect(labels).not.toContain('Village — B2B');
  });

  it("le dit plutôt que d'afficher une grille vide quand il n'y en a aucun", () => {
    const text = render(true, []).nativeElement.textContent ?? '';

    expect(text).toContain('Aucun point de vente');
  });

  it("ne confond pas « aucun » avec « je n'ai pas pu lire »", () => {
    // Les deux rendaient la même ligne, et la première invite à recréer ce qui
    // existe déjà — le pire conseil possible sur un backend éteint.
    const text = render(true, [], 'Serveur injoignable.').nativeElement.textContent ?? '';

    expect(text).toContain('illisibles');
    expect(text).toContain('Serveur injoignable.');
    expect(text).not.toContain('Créez-en un');
  });
});
