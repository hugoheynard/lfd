import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import type { OrderView } from '@lfd/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_CONFIG } from '../../../auth/auth.config';
import { provideRecognised } from '../../client-orders.fixture';
import { FR } from '../../copy/fr';
import { ClientOrderHistory } from '../client-order-history.service';
import { LIVE_PICKUP } from '../order-view.fixture';
import { RetraitPage } from './retrait-page';

/** Une commande de retrait, dont ces cas ne font varier que ce qu'ils éprouvent. */
function order(over: Partial<OrderView> = {}): OrderView {
  return { ...LIVE_PICKUP, ...over };
}

async function boot(found: OrderView | null): Promise<ComponentFixture<RetraitPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RetraitPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRecognised(),
      { provide: ActivatedRoute, useValue: { paramMap: of({ get: () => 'ord_9' }) } },
    ],
  });
  // La commande est POSÉE : ce qu'on éprouve ici est l'écran, pas la lecture —
  // elle a sa propre frontière, et son propre refus non divulguant.
  vi.spyOn(TestBed.inject(ClientOrderHistory), 'byId').mockResolvedValue(found);

  const fixture = TestBed.createComponent(RetraitPage);
  fixture.detectChanges();
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<RetraitPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

/**
 * 🔴 **Le jeton descendait, aucun écran ne l'affichait.** `OrderView` porte
 * `handoverToken` depuis toujours, le staff a sa route de scan depuis toujours,
 * et le bouton « Voir mon QR de retrait » répondait « cet écran arrive au
 * prochain lot ». Ces cas tiennent l'écran qui manquait.
 */
describe('RetraitPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Le code encode une URL de l'app **admin** : c'est le staff qui scanne, avec
   * l'appareil photo natif de son téléphone. Un code qui n'encoderait que le
   * jeton l'obligerait à ouvrir une application d'abord — au comptoir, c'est le
   * geste qu'on ne fait pas.
   */
  it('dessine un code qui mène au scan du STAFF', async () => {
    const fixture = await boot(order());
    const svg = (fixture.nativeElement as HTMLElement).querySelector('lfd-qr-code');

    if (AUTH_CONFIG.adminBaseUrl === '') {
      // Origine admin non configurée : aucun code, et c'est la bonne conduite.
      expect(svg).toBeNull();
      expect(text(fixture)).toContain(FR.qr.unavailable);
      return;
    }
    expect(svg).not.toBeNull();
    expect(text(fixture)).toContain('CMD-0009');
    expect(text(fixture)).toContain(FR.qr.lead);
  });

  /** Un coursier n'a pas de comptoir : pas de jeton, donc pas de code. */
  it('explique qu’une commande LIVRÉE n’a pas de code', async () => {
    const fixture = await boot(order({ fulfillmentMethod: 'delivery', handoverToken: null }));

    expect((fixture.nativeElement as HTMLElement).querySelector('lfd-qr-code')).toBeNull();
    expect(text(fixture)).toContain(FR.qr.delivery);
  });

  /** Déjà remise, ou jeton absent : on le dit, on n'affiche pas un carré mort. */
  it('le dit quand il n’y a plus de code à présenter', async () => {
    const fixture = await boot(order({ handoverToken: null }));

    expect(text(fixture)).toContain(FR.qr.unavailable);
  });

  /**
   * Introuvable ou celle d'un autre : le serveur rend 404 dans les deux cas, et
   * l'écran ne distingue pas — il n'a rien à montrer de toute façon.
   */
  it('ne divulgue rien sur une commande qu’il ne peut pas lire', async () => {
    const fixture = await boot(null);

    expect(text(fixture)).toContain(FR.qr.unknown);
    expect(text(fixture)).not.toContain('CMD-0009');
  });
});
