import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type {
  PickupAddressPayload,
  PickupAddressUpdatePayload,
  PickupAddressView,
} from '@lfd/contracts';
import { postalDraftFrom } from '@lfd/b2b-ui/company';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { PickupAddressPage } from './pickup-address-page';

/**
 * **Le point de retrait, en page.** Ces cas viennent de `PickupPanel`, que cette
 * page remplace le 2026-09-16 : les clientèles de la réduction (plan « remise et
 * livraison par clientèle », D2) et la zone dangereuse. Ce qui change est
 * l'issue — on NAVIGUE vers la liste au lieu de fermer un panneau — et la
 * source du « dernier point », désormais DÉDUITE de la liste chargée plutôt que
 * reçue en paramètre.
 */

const LABO: PickupAddressView = {
  id: 'pick_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  isDefault: true,
  discount: { mode: 'amount', cents: 800 },
  discountAudiences: { b2b: true, b2c: false },
  opening: { publicOpening: null, proPickup: null },
};

/** Un second point : c'est lui qui rend le premier supprimable. */
const VILLAGE: PickupAddressView = { ...LABO, id: 'pick_2', label: 'Village', isDefault: false };

const LIST_PATH = '/b2b/reglages/points-de-retrait';

class FakePickups {
  readonly created: PickupAddressPayload[] = [];
  readonly updated: PickupAddressUpdatePayload[] = [];
  readonly removed: string[] = [];
  refusal: unknown = null;

  constructor(private readonly points: readonly PickupAddressView[]) {}

  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve(this.points);
  }

  create(payload: PickupAddressPayload): Promise<{ id: string }> {
    this.created.push(payload);
    return this.refusal === null
      ? Promise.resolve({ id: 'pick_new' })
      : Promise.reject(this.refusal);
  }

  update(_id: string, payload: PickupAddressUpdatePayload): Promise<void> {
    this.updated.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }

  remove(id: string): Promise<void> {
    this.removed.push(id);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

interface Harness {
  readonly fixture: ComponentFixture<PickupAddressPage>;
  readonly pickups: FakePickups;
  readonly router: Router;
}

/**
 * Monte la page. `id` absent = création. `points` est ce que rend la liste —
 * c'est d'elle que la page tire le point ET le fait qu'il soit supprimable.
 */
async function mount(
  id: string | undefined,
  points: readonly PickupAddressView[] = [LABO, VILLAGE],
): Promise<Harness> {
  const pickups = new FakePickups(points);
  TestBed.configureTestingModule({
    imports: [PickupAddressPage],
    providers: [
      provideRouter([]),
      { provide: PickupAddressesService, useValue: pickups },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(PickupAddressPage);
  if (id !== undefined) {
    fixture.componentRef.setInput('id', id);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, pickups, router: TestBed.inject(Router) };
}

/** Les cases natives des deux clientèles, B2B puis B2C. */
const audienceBoxes = (fixture: ComponentFixture<PickupAddressPage>): HTMLInputElement[] =>
  Array.from(fixture.nativeElement.querySelectorAll('fold-fieldset fold-checkbox input'));

describe('PickupAddressPage — le chargement', () => {
  it('lit le point dans la liste, faute de route unitaire', async () => {
    const { fixture } = await mount('pick_1');

    expect(fixture.componentInstance['draft']().label).toBe('Labo');
    expect(fixture.componentInstance['heading']()).toBe('Labo');
  });

  it('dit qu’un identifiant inconnu ne désigne rien, plutôt que d’inventer', async () => {
    const { fixture } = await mount('pick_absent');

    expect(fixture.componentInstance['notFound']()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Point de retrait introuvable');
  });

  it('sans identifiant, c’est une création : rien à charger', async () => {
    const { fixture } = await mount(undefined);

    expect(fixture.componentInstance['isCreate']()).toBe(true);
    expect(fixture.componentInstance['loading']()).toBe(false);
    expect(fixture.componentInstance['heading']()).toBe('Nouveau point de retrait');
  });
});

describe('PickupAddressPage — les clientèles de la réduction', () => {
  it('reprend les clientèles du point, et les renvoie à la modification', async () => {
    const { fixture, pickups } = await mount('pick_1');

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.discountAudiences).toEqual({ b2b: true, b2c: false });
  });

  it('envoie une case changée', async () => {
    const { fixture, pickups } = await mount('pick_1');
    fixture.componentInstance['setAudience']('b2c', true);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
  });

  it('crée un point avec les deux clientèles par défaut — l’existant', async () => {
    const { fixture, pickups } = await mount(undefined);
    fixture.componentInstance['draft'].set(postalDraftFrom(LABO));
    fixture.componentInstance['setDiscount']({ direction: 'decrease', mode: 'amount', cents: 500 });

    await fixture.componentInstance['submit']();

    expect(pickups.created[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
  });

  it('grise les cases tant qu’il n’y a pas de réduction', async () => {
    const { fixture } = await mount('pick_1', [{ ...LABO, discount: null }, VILLAGE]);

    expect(audienceBoxes(fixture).map((box) => box.disabled)).toEqual([true, true]);
  });

  it('les rend cochables dès qu’une réduction existe', async () => {
    const { fixture } = await mount('pick_1');

    expect(audienceBoxes(fixture).map((box) => box.disabled)).toEqual([false, false]);
  });

  it('🔴 retirer la réduction ne remet pas les cases à zéro', async () => {
    // Sans réduction, le serveur ne les lit pas ; les effacer ferait perdre un
    // choix qu'on retrouverait en rouvrant la réduction.
    const { fixture, pickups } = await mount('pick_1');
    fixture.componentInstance['setDiscount'](null);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]).toMatchObject({
      discount: null,
      discountAudiences: { b2b: true, b2c: false },
    });
  });

  it('refuse d’envoyer une réduction qui ne vise personne, et le dit', async () => {
    const { fixture, pickups } = await mount('pick_1');
    fixture.componentInstance['setAudience']('b2b', false);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();

    expect(pickups.updated).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Cochez au moins une clientèle');
  });

  it('🔴 garde le refus du serveur SUR LA PAGE, sans naviguer', async () => {
    const { fixture, pickups, router } = await mount('pick_1');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    pickups.refusal = {
      status: 400,
      error: {
        code: 'validation',
        message: 'Cochez au moins une clientèle, ou retirez la réduction',
      },
    };

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Cochez au moins une clientèle, ou retirez la réduction');
  });

  it('revient à la liste après un enregistrement réussi', async () => {
    const { fixture, router } = await mount('pick_1');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance['submit']();

    expect(navigate).toHaveBeenCalledWith([LIST_PATH]);
  });
});

/**
 * **La suppression d'un point** vit dans une zone dangereuse qui fait taper le
 * nom du point — elle était une entrée du menu de la liste, confirmée d'un clic,
 * jusqu'au 2026-09-15.
 */
describe('PickupAddressPage — la zone dangereuse', () => {
  const zone = (fixture: ComponentFixture<PickupAddressPage>): HTMLElement | null =>
    fixture.nativeElement.querySelector('fold-danger-zone');

  it('n’existe pas à la création : il n’y a rien à supprimer', async () => {
    const { fixture } = await mount(undefined);

    expect(zone(fixture)).toBeNull();
  });

  it('fait taper le nom du point pour supprimer', async () => {
    const { fixture } = await mount('pick_1');

    expect(zone(fixture)).not.toBeNull();
    expect(fixture.componentInstance['deleteAction']()).toBe('Supprimer définitivement');
    expect(fixture.componentInstance['confirmPhrase']()).toBe('Labo');
  });

  it('un point sans nom se confirme par sa ville', async () => {
    const { fixture } = await mount('pick_1', [{ ...LABO, label: '' }, VILLAGE]);

    expect(fixture.componentInstance['confirmPhrase']()).toBe('Paris');
  });

  it('supprime, puis revient à la liste', async () => {
    const { fixture, pickups, router } = await mount('pick_1');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance['remove']();

    expect(pickups.removed).toEqual(['pick_1']);
    expect(navigate).toHaveBeenCalledWith([LIST_PATH]);
  });

  it('🔴 le dernier point : la zone explique, et rien ne part', async () => {
    // « Dernier » se DÉDUIT de la liste chargée : un seul point, donc rien à
    // supprimer. Le panneau le recevait en paramètre, ce qui laissait la liste
    // seule juge d'un fait que la page lit elle-même.
    const { fixture, pickups } = await mount('pick_1', [LABO]);

    expect(fixture.componentInstance['deleteAction']()).toBeUndefined();
    expect(zone(fixture)?.textContent).toContain('Le dernier point de retrait ne se supprime pas');

    await fixture.componentInstance['remove']();
    expect(pickups.removed).toEqual([]);
  });

  it('un refus reste sur la page, sans naviguer', async () => {
    const { fixture, pickups, router } = await mount('pick_1');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    pickups.refusal = { status: 409, error: { message: 'Point encore utilisé.' } };

    await fixture.componentInstance['remove']();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Point encore utilisé.');
  });
});
