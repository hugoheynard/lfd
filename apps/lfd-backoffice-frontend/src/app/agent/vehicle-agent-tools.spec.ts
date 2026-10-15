import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DeliveryZoneView, VehiclePayload, VehicleView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DeliveryZonesService } from '../b2b/reglages/delivery-zones.service';
import { DeliverySettingsService } from '../livraison/delivery-settings.service';

import { declareVehicleAgentTools, mergedPayload } from './vehicle-agent-tools';

type ToolArgs = Record<string, unknown>;

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: ToolArgs) => Promise<string>;
}

const NO_CARGO_GAP = {
  code: 'no_cargo',
  message: "« Kangoo » n'a pas ses cotes utiles (longueur, largeur, hauteur) : il ne compte pas…",
} as const;

function vehicle(id: string, overrides: Partial<VehicleView> = {}): VehicleView {
  return {
    id,
    name: 'Kangoo',
    plate: 'AB-123-CD',
    retiredAt: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    cargo: { lengthCm: 180, widthCm: 120, heightCm: 110, volumeLiters: 2376 },
    wheelArches: { lengthCm: 80, protrusionCm: 20, fromBackCm: 30, heightCm: 25 },
    refrigeration: null,
    energy: 'electric',
    allowedZoneIds: [],
    gaps: [],
    ...overrides,
  };
}

const ZONE: DeliveryZoneView = {
  id: 'z1',
  label: 'Chambéry',
  postalPrefixes: ['73'],
  fee: { mode: 'amount', cents: 0 },
};

interface Wire {
  readonly vehicles: VehicleView[];
  readonly added: VehiclePayload[];
  readonly updated: { readonly id: string; readonly payload: VehiclePayload }[];
}

function armTools(options: { canWrite?: boolean; refuseName?: string } = {}) {
  const registered = new Map<string, RegisteredTool>();
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.set(tool.name, tool);
        return Promise.resolve();
      },
    },
  });
  const wire: Wire = { vehicles: [], added: [], updated: [] };
  const api: Pick<DeliverySettingsService, 'vehicles' | 'addVehicleAndGetId' | 'updateVehicle'> = {
    vehicles: () => Promise.resolve({ vehicles: [...wire.vehicles] }),
    addVehicleAndGetId: (payload) => {
      if (payload.name === options.refuseName) {
        return Promise.reject(
          new HttpErrorResponse({
            status: 409,
            error: { message: 'La plaque AB-123-CD est déjà portée par « Kangoo ».' },
          }),
        );
      }
      wire.added.push(payload);
      const id = `v${String(wire.added.length + 10)}`;
      wire.vehicles.push(
        vehicle(id, {
          name: payload.name,
          plate: payload.plate ?? null,
          cargo: null,
          wheelArches: null,
          gaps: payload.cargo === null ? [{ ...NO_CARGO_GAP }] : [],
        }),
      );
      return Promise.resolve(id);
    },
    updateVehicle: (id, payload) => {
      wire.updated.push({ id, payload });
      return Promise.resolve();
    },
  };
  const zones: Pick<DeliveryZonesService, 'list'> = { list: () => Promise.resolve([ZONE]) };
  TestBed.configureTestingModule({
    providers: [
      { provide: DeliverySettingsService, useValue: api },
      { provide: DeliveryZonesService, useValue: zones },
    ],
  });
  const names = runInInjectionContext(TestBed.inject(Injector), () =>
    declareVehicleAgentTools(options.canWrite ?? true),
  );

  function tool(name: string): RegisteredTool {
    const found = registered.get(name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found;
  }
  return { names, tool, wire, registered };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('declareVehicleAgentTools', () => {
  it('rend les noms qu’il enregistre, tous préfixés `vehicle_`, et aucun retrait', () => {
    const { names, tool } = armTools();
    expect(names).toEqual([
      'vehicle_list',
      'vehicle_create',
      'vehicle_create_many',
      'vehicle_update',
    ]);
    for (const name of names) {
      expect(tool(name).name).toBe(name);
    }
    expect(names.some((name) => name.includes('retire') || name.includes('reactivat'))).toBe(false);
  });

  it('sans le droit d’écriture, ne déclare QUE la lecture', () => {
    const { names, registered } = armTools({ canWrite: false });
    expect(names).toEqual(['vehicle_list']);
    expect([...registered.keys()]).toEqual(['vehicle_list']);
  });

  it('vehicle_list dit chaque véhicule, ses zones nommées et ses avertissements', async () => {
    const { tool, wire } = armTools();
    wire.vehicles.push(
      vehicle('v1', { allowedZoneIds: ['z1'] }),
      vehicle('v2', {
        name: 'Kangoo',
        plate: null,
        cargo: null,
        wheelArches: null,
        gaps: [NO_CARGO_GAP],
      }),
      vehicle('v3', { name: 'Vieux', retiredAt: '2026-09-01T08:00:00.000Z' }),
    );

    const text = await tool('vehicle_list').execute({});

    expect(text).toContain(
      '2 véhicule(s) actif(s), dont 1 avec des données manquantes ; 1 retiré(s)',
    );
    expect(text).toContain('id v1 — plaque AB-123-CD');
    expect(text).toContain('Zone : Chambéry');
    expect(text).toContain('plaque aucune');
    expect(text).toContain(`⚠ no_cargo — ${NO_CARGO_GAP.message}`);
    expect(text).toContain('RETIRÉ le 2026-09-01');
    expect(text).toContain('énergie Électrique');
  });

  it('vehicle_create n’exige que le nom, n’invente rien, et rend les avertissements', async () => {
    const { tool, wire } = armTools();

    const text = await tool('vehicle_create').execute({ name: 'Kangoo' });

    expect(wire.added).toEqual([
      {
        name: 'Kangoo',
        plate: null,
        cargo: null,
        wheelArches: null,
        refrigeration: null,
        energy: null,
        allowedZoneIds: [],
      },
    ]);
    expect(text).toContain('CRÉÉ — ACTIF — « Kangoo » — id v11');
    expect(text).toContain('no_cargo');
  });

  it('vehicle_create rend le refus du serveur, lisible', async () => {
    const { tool } = armTools({ refuseName: 'Doublon' });
    const text = await tool('vehicle_create').execute({ name: 'Doublon', plate: 'AB-123-CD' });
    expect(text).toBe(
      'Création du véhicule — REFUSÉ : 409 — La plaque AB-123-CD est déjà portée par « Kangoo ».',
    );
  });

  it('vehicle_create_many : une ligne par véhicule, un refus n’arrête pas les autres', async () => {
    const { tool, wire } = armTools({ refuseName: 'Doublon' });

    const text = await tool('vehicle_create_many').execute({
      items: [
        { name: 'A', cargo: { lengthCm: 100, widthCm: 100, heightCm: 100 } },
        { name: 'Doublon' },
        { name: 'C' },
      ],
    });

    const lines = text.split('\n').filter((line) => !line.startsWith('  '));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('« Doublon » — REFUSÉ : 409');
    expect(wire.added.map((payload) => payload.name)).toEqual(['A', 'C']);
  });

  it('vehicle_update garde ce qui est omis et renvoie la fiche ENTIÈRE', async () => {
    const { tool, wire } = armTools();
    wire.vehicles.push(vehicle('v1', { allowedZoneIds: ['z1'], refrigeration: null }));

    const text = await tool('vehicle_update').execute({ id: 'v1', plate: 'EF-456-GH' });

    // Régression évitée : `PUT` lit un champ absent comme `null` — renvoyer
    // seulement la plaque effacerait les cotes, les passages et les zones.
    expect(wire.updated).toEqual([
      {
        id: 'v1',
        payload: {
          name: 'Kangoo',
          plate: 'EF-456-GH',
          cargo: { lengthCm: 180, widthCm: 120, heightCm: 110 },
          wheelArches: { lengthCm: 80, protrusionCm: 20, fromBackCm: 30, heightCm: 25 },
          refrigeration: null,
          energy: 'electric',
          allowedZoneIds: ['z1'],
        },
      },
    ]);
    expect(text).toContain('CORRIGÉ — ACTIF — « Kangoo » — id v1');
  });

  it('vehicle_update dit le cas réel quand l’id est inconnu, sans rien écrire', async () => {
    const { tool, wire } = armTools();
    const text = await tool('vehicle_update').execute({ id: 'v404', name: 'X' });
    expect(text).toContain("aucun véhicule n'a l'id v404");
    expect(wire.updated).toEqual([]);
  });
});

describe('mergedPayload', () => {
  it('efface ce que `clear` nomme, et effacer les cotes efface les passages de roue', () => {
    const payload = mergedPayload(vehicle('v1', { allowedZoneIds: ['z1'] }), {}, [
      'cargo',
      'energy',
      'allowedZoneIds',
    ]);
    expect(payload).toMatchObject({
      cargo: null,
      wheelArches: null,
      energy: null,
      allowedZoneIds: [],
      plate: 'AB-123-CD',
    });
  });

  it('laisse partir des passages DONNÉS sans plancher : le domaine les refuse en le nommant', () => {
    const arches = { lengthCm: 80, protrusionCm: 20, fromBackCm: 30, heightCm: 25 };
    const payload = mergedPayload(
      vehicle('v1', { cargo: null, wheelArches: null }),
      {
        wheelArches: arches,
      },
      [],
    );
    expect(payload.wheelArches).toEqual(arches);
    expect(payload.cargo).toBeNull();
  });
});
