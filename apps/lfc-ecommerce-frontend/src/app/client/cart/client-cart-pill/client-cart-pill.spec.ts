import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';

import { ClientCartPill } from './client-cart-pill';

/** Un hôte de panneaux qui compte ses ouvertures et rend de vraies références. */
class PanelsDouble {
  readonly opened: unknown[] = [];
  readonly configs: unknown[] = [];
  open(component: unknown, config: unknown): FoldPanelRef<void> {
    this.opened.push(component);
    this.configs.push(config);
    return new FoldPanelRef<void>(this.opened.length, (result) => {
      void result;
    });
  }
}

function boot(): { fixture: ComponentFixture<ClientCartPill>; panels: PanelsDouble } {
  const panels = new PanelsDouble();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ClientCartPill],
    providers: [{ provide: FoldPanelHostService, useValue: panels }],
  });
  const fixture = TestBed.createComponent(ClientCartPill);
  fixture.detectChanges();
  return { fixture, panels };
}

const pocketPill = (fixture: ComponentFixture<ClientCartPill>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.in-pocket');

/** Le panier se charge à la demande : on attend que l'import dynamique ait abouti. */
async function opened(panels: PanelsDouble, count: number): Promise<void> {
  for (let tries = 0; tries < 100 && panels.opened.length < count; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('ClientCartPill — la bascule du panier', () => {
  // jsdom n'a pas `matchMedia` : on se met en pile, là où la pastille ouvre la feuille.
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string): Pick<MediaQueryList, 'matches' | 'media'> => ({
        matches: true,
        media: query,
      }),
    });
  });

  it('un clic ouvre le panier, un second le referme sans en empiler un autre', async () => {
    const { fixture, panels } = boot();

    pocketPill(fixture)?.click();
    await opened(panels, 1);
    expect(panels.opened.length).toBe(1);
    expect(panels.configs[0]).toMatchObject({ modal: false });

    pocketPill(fixture)?.click();
    await fixture.whenStable();
    expect(panels.opened.length).toBe(1);

    // Oublié à la fermeture : le clic suivant rouvre.
    pocketPill(fixture)?.click();
    await opened(panels, 2);
    expect(panels.opened.length).toBe(2);
  });
});
