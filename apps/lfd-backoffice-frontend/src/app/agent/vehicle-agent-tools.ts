import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import { VEHICLE_ENERGIES } from '@lfd/contracts';
import type {
  DeliveryZoneView,
  VehicleCargoPayload,
  VehicleEnergy,
  VehiclePayload,
  VehicleRefrigerationPayload,
  VehicleView,
  VehicleWheelArchesPayload,
} from '@lfd/contracts';

import { DeliveryZonesService } from '../b2b/reglages/delivery-zones.service';
import { DeliverySettingsService } from '../livraison/delivery-settings.service';

import { said } from './agent-tool-text';
import { fleetText, vehicleText } from './vehicle-agent-text';

/** Les outils de lecture — déclarés avec `delivery_settings:read`. */
export const VEHICLE_READ_TOOLS = ['vehicle_list'] as const;
/** Les outils d'écriture — déclarés en plus avec `delivery_settings:write`. */
export const VEHICLE_WRITE_TOOLS = [
  'vehicle_create',
  'vehicle_create_many',
  'vehicle_update',
] as const;

/** Les champs qu'un outil d'écriture peut effacer (`clear` de `vehicle_update`). */
const CLEARABLE = [
  'plate',
  'cargo',
  'wheelArches',
  'refrigeration',
  'energy',
  'allowedZoneIds',
] as const;
type Clearable = (typeof CLEARABLE)[number];

const INT = { type: 'integer' } as const;

/** Les champs d'une fiche, mot pour mot ceux du contrat (`vehiclePayloadSchema`). */
const VEHICLE_FIELDS = {
  name: { type: 'string' },
  plate: { type: 'string' },
  cargo: {
    type: 'object',
    properties: { lengthCm: INT, widthCm: INT, heightCm: INT },
    required: ['lengthCm', 'widthCm', 'heightCm'],
    additionalProperties: false,
  },
  wheelArches: {
    type: 'object',
    properties: { lengthCm: INT, protrusionCm: INT, fromBackCm: INT, heightCm: INT },
    required: ['lengthCm', 'protrusionCm', 'fromBackCm', 'heightCm'],
    additionalProperties: false,
  },
  refrigeration: {
    type: 'object',
    properties: { volumeLiters: INT, minTempC: INT, maxTempC: INT },
    required: ['volumeLiters', 'minTempC', 'maxTempC'],
    additionalProperties: false,
  },
  energy: { type: 'string', enum: VEHICLE_ENERGIES },
  allowedZoneIds: { type: 'array', items: { type: 'string' } },
} as const;

const FIELDS_HELP =
  'Seul `name` est obligatoire (60 caractères au plus). Facultatifs : `plate` (plaque, normalisée par le serveur), `cargo` (cotes UTILES en cm entiers : lengthCm, widthCm, heightCm), `wheelArches` (passages de roue en cm : lengthCm, protrusionCm de chaque côté, fromBackCm, heightCm — jamais sans cargo), `refrigeration` (volumeLiters, minTempC, maxTempC ; absent = véhicule sec), `energy` (electric, hybrid, diesel, petrol, gas), `allowedZoneIds` (identifiants des zones de livraison ; vide = partout).';

/** Ce qu'un outil reçoit pour une fiche — tous les champs facultatifs sauf le nom à la création. */
interface VehicleFields {
  readonly name?: string | undefined;
  readonly plate?: string | undefined;
  readonly cargo?: VehicleCargoPayload | undefined;
  readonly wheelArches?: VehicleWheelArchesPayload | undefined;
  readonly refrigeration?: VehicleRefrigerationPayload | undefined;
  readonly energy?: VehicleEnergy | undefined;
  readonly allowedZoneIds?: readonly string[] | undefined;
}

/**
 * **Les outils WebMCP de la flotte** (Hugo, 2026-10-14) — Réglages →
 * Livraison → Véhicules, sans le clic.
 *
 * Chaque outil vise la route de l'écran par {@link DeliverySettingsService} :
 * même mur (`@AdminSurface("delivery_settings")`), mêmes refus du domaine
 * (plaque en double, cotes hors bornes, passages sans plancher…), rendus
 * par {@link said} avec le message du serveur.
 *
 * Chaque écriture rend la fiche RELUE, avec ses avertissements (`gaps`) : ce
 * que l'écran afficherait sous le véhicule.
 *
 * Retirer et réactiver n'y sont pas : sortir un véhicule de la flotte change
 * ce que la composition peut proposer, et reste un geste de l'écran.
 */
export function declareVehicleAgentTools(canWrite: boolean): readonly string[] {
  const api = inject(DeliverySettingsService);
  const zonesApi = inject(DeliveryZonesService);

  /** Les zones nomment celles d'un véhicule ; leur échec ne cache pas la flotte. */
  async function zones(): Promise<readonly DeliveryZoneView[] | null> {
    try {
      return await zonesApi.list();
    } catch {
      return null;
    }
  }

  async function reread(id: string): Promise<string> {
    const [view, known] = await Promise.all([api.vehicles(), zones()]);
    const vehicle = view.vehicles.find((candidate) => candidate.id === id);
    return vehicle === undefined
      ? `id ${id} (relecture : introuvable)`
      : vehicleText(vehicle, known);
  }

  async function createOne(fields: VehicleFields): Promise<string> {
    const id = await api.addVehicleAndGetId(payloadOf(fields));
    return `CRÉÉ — ${await reread(id)}`;
  }

  void declareExperimentalWebMcpTool({
    name: 'vehicle_list',
    description:
      'La flotte de livraison : chaque véhicule (actifs puis retirés), son id, sa plaque, ses cotes utiles, passages de roue, froid, énergie, zones, et ses AVERTISSEMENTS — ce qu’il ne peut pas faire tant qu’une donnée manque (pas de plaque, pas de cotes, pas de passages de roue). Lecture seule.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () =>
      said('Lecture de la flotte', async () => {
        const [view, known] = await Promise.all([api.vehicles(), zones()]);
        return fleetText(view, known);
      }),
  });

  if (!canWrite) {
    return VEHICLE_READ_TOOLS;
  }

  void declareExperimentalWebMcpTool({
    name: 'vehicle_create',
    description: `Ajoute un véhicule à la flotte, comme le bouton « Ajouter » de l'écran. ${FIELDS_HELP} Rend la fiche créée et ses avertissements.`,
    inputSchema: {
      type: 'object',
      properties: VEHICLE_FIELDS,
      required: ['name'],
      additionalProperties: false,
    },
    execute: (args) => said('Création du véhicule', () => createOne(args)),
  });

  void declareExperimentalWebMcpTool({
    name: 'vehicle_create_many',
    description: `Ajoute plusieurs véhicules en un appel (\`items\`, un objet par véhicule). ${FIELDS_HELP} Une ligne par véhicule : la fiche créée et ses avertissements, ou le refus nommé. Un échec n'arrête pas les autres.`,
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: VEHICLE_FIELDS,
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Création en lot', async () => {
        const items: readonly VehicleFields[] = args.items;
        const lines: string[] = [];
        for (const item of items) {
          lines.push(await said(`« ${item.name ?? ''} »`, () => createOne(item)));
        }
        return lines.length === 0 ? 'Aucun véhicule donné.' : lines.join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'vehicle_update',
    description: `Corrige un véhicule par son \`id\` (vehicle_list), comme « Modifier » à l'écran. Un champ OMIS GARDE sa valeur ; pour effacer, le nommer dans \`clear\` (plate, cargo, wheelArches, refrigeration, energy, allowedZoneIds — effacer cargo efface aussi les passages de roue). ${FIELDS_HELP} Rend la fiche relue et ses avertissements.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        ...VEHICLE_FIELDS,
        clear: { type: 'array', items: { type: 'string', enum: CLEARABLE } },
      },
      required: ['id'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Correction du véhicule', async () => {
        const view = await api.vehicles();
        const current = view.vehicles.find((vehicle) => vehicle.id === args.id);
        if (current === undefined) {
          return `Correction du véhicule — REFUSÉ : aucun véhicule n'a l'id ${args.id}. Relire la flotte par vehicle_list.`;
        }
        await api.updateVehicle(current.id, mergedPayload(current, args, args.clear ?? []));
        return `CORRIGÉ — ${await reread(current.id)}`;
      }),
  });

  return [...VEHICLE_READ_TOOLS, ...VEHICLE_WRITE_TOOLS];
}

/** La charge d'une création : les champs donnés, rien d'inventé. */
function payloadOf(fields: VehicleFields): VehiclePayload {
  return {
    name: fields.name ?? '',
    plate: fields.plate ?? null,
    cargo: fields.cargo ?? null,
    wheelArches: fields.wheelArches ?? null,
    refrigeration: fields.refrigeration ?? null,
    energy: fields.energy ?? null,
    allowedZoneIds: [...(fields.allowedZoneIds ?? [])],
  };
}

/**
 * La fiche ENTIÈRE à renvoyer : `PUT` remplace tout, et un champ absent y
 * vaut `null` (`vehiclePayloadSchema`). On part donc de la fiche lue, on pose
 * ce qui est donné, on efface ce qui est nommé dans `clear`.
 */
export function mergedPayload(
  current: VehicleView,
  given: VehicleFields,
  clear: readonly Clearable[],
): VehiclePayload {
  const cleared = new Set<Clearable>(clear);
  const keptCargo =
    current.cargo === null
      ? null
      : {
          lengthCm: current.cargo.lengthCm,
          widthCm: current.cargo.widthCm,
          heightCm: current.cargo.heightCm,
        };
  const cargo = cleared.has('cargo') ? null : (given.cargo ?? keptCargo);
  return {
    name: given.name ?? current.name,
    plate: cleared.has('plate') ? null : (given.plate ?? current.plate),
    cargo,
    // Sans plancher, pas de passages : effacer `cargo` les efface. Des passages
    // DONNÉS sans plancher partent tels quels, et le domaine les refuse en
    // nommant le cas — pas de suppression silencieuse ici.
    wheelArches:
      cleared.has('wheelArches') || cleared.has('cargo')
        ? null
        : (given.wheelArches ?? current.wheelArches),
    refrigeration: cleared.has('refrigeration')
      ? null
      : (given.refrigeration ?? current.refrigeration),
    energy: cleared.has('energy') ? null : (given.energy ?? current.energy),
    allowedZoneIds: cleared.has('allowedZoneIds')
      ? []
      : [...(given.allowedZoneIds ?? current.allowedZoneIds)],
  };
}
