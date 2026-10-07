import {
  type BinTypeView,
  PURCHASE_ASSISTANT_MAX_FORMATS,
  type PurchaseAssistantPayload,
  type VehicleView,
} from '@lfd/contracts';

import { cmToMm, mmToCm } from './delivery-bins';

/**
 * Les dérivations pures de **l'assistant d'achat**
 * (`documentation/livraisons/chargement/plan-geometrie-du-plancher.md`, G-D3, lot G3) :
 * ce qu'on saisit à l'écran, et ce qui part au serveur.
 *
 * Le CALCUL n'est pas ici : il est côté serveur (`POST
 * admin/livraison/assistant-achat`). Ce fichier ne fait que traduire la
 * saisie en corps, et dessiner ce qui revient. Les bornes des dimensions, du
 * jeu et de la pile sont celles du domaine : l'écran ne les recopie pas, il
 * affiche le refus du serveur tel quel.
 */

export * from './purchase-assistant-plan';

export { PURCHASE_ASSISTANT_MAX_FORMATS };

/** Le jeu entre bacs proposé à l'ouverture (G-D2 : « défaut 1 cm »). */
export const DEFAULT_GAP_CM = 1;

/** Trois cotes saisies ; `null` tant que le champ est vide. */
export interface DimensionsDraft {
  readonly lengthCm: number | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
}

export interface FloorDraft extends DimensionsDraft {
  readonly arches: boolean;
  readonly archLengthCm: number | null;
  readonly archProtrusionCm: number | null;
  readonly archFromBackCm: number | null;
  /** Facultative : sans elle, rien n'est empilé au-dessus des passages (G-D2 bis). */
  readonly archHeightCm: number | null;
}

export interface FormatDraft {
  /** Identité d'écran, pour le `track` : jamais envoyée. */
  readonly key: number;
  readonly name: string;
  readonly outer: DimensionsDraft;
  readonly inner: DimensionsDraft;
  readonly maxStack: number | null;
}

export interface AssistantDraft {
  readonly floor: FloorDraft;
  readonly gapCm: number | null;
  readonly formats: readonly FormatDraft[];
}

export type BuiltPayload =
  | { readonly ok: true; readonly payload: PurchaseAssistantPayload }
  | { readonly ok: false; readonly missing: readonly string[] };

const EMPTY_DIMENSIONS: DimensionsDraft = { lengthCm: null, widthCm: null, heightCm: null };

/** Un plancher vide : rien n'est inventé tant qu'on n'a ni véhicule ni saisie. */
export const EMPTY_FLOOR: FloorDraft = {
  ...EMPTY_DIMENSIONS,
  arches: false,
  archLengthCm: null,
  archProtrusionCm: null,
  archFromBackCm: null,
  archHeightCm: null,
};

/** Les véhicules actifs dont on connaît l'espace utile — les seuls qui pré-remplissent. */
export function measuredVehicles(vehicles: readonly VehicleView[]): readonly VehicleView[] {
  return vehicles.filter((vehicle) => vehicle.retiredAt === null && vehicle.cargo !== null);
}

/**
 * Le plancher d'un véhicule de la flotte, passages de roue compris (G4) : un
 * véhicule sans passages décoche la case, les cotes saisies restent.
 */
export function floorOfVehicle(vehicle: VehicleView, current: FloorDraft): FloorDraft {
  const cargo = vehicle.cargo;
  if (cargo === null) {
    return current;
  }
  return {
    ...current,
    lengthCm: cargo.lengthCm,
    widthCm: cargo.widthCm,
    heightCm: cargo.heightCm,
    ...archesOfVehicle(vehicle, current),
  };
}

function archesOfVehicle(
  vehicle: VehicleView,
  current: FloorDraft,
): Pick<
  FloorDraft,
  'arches' | 'archLengthCm' | 'archProtrusionCm' | 'archFromBackCm' | 'archHeightCm'
> {
  const arches = vehicle.wheelArches;
  if (arches === null) {
    return {
      arches: false,
      archLengthCm: current.archLengthCm,
      archProtrusionCm: current.archProtrusionCm,
      archFromBackCm: current.archFromBackCm,
      archHeightCm: current.archHeightCm,
    };
  }
  return {
    arches: true,
    archLengthCm: arches.lengthCm,
    archProtrusionCm: arches.protrusionCm,
    archFromBackCm: arches.fromBackCm,
    archHeightCm: arches.heightCm,
  };
}

/**
 * Les types de bacs EN SERVICE, dans l'ordre du catalogue, dix au plus.
 *
 * Un type et un format se mesurent tous deux au millimètre ; la saisie est en
 * cm à une décimale. Un type à 665 mm arrive à 66,5 et repart à 665 : aucun
 * arrondi (2026-10-07).
 */
export function formatsOfBinTypes(types: readonly BinTypeView[]): readonly FormatDraft[] {
  const cm = (side: BinTypeView['outer']): DimensionsDraft => ({
    lengthCm: mmToCm(side.lengthMm),
    widthCm: mmToCm(side.widthMm),
    heightCm: mmToCm(side.heightMm),
  });
  return types
    .filter((type) => type.archivedAt === null)
    .slice(0, PURCHASE_ASSISTANT_MAX_FORMATS)
    .map((type, index) => ({
      key: index + 1,
      name: type.name,
      outer: cm(type.outer),
      inner: cm(type.inner),
      maxStack: type.maxStack,
    }));
}

/** Un format neuf à comparer : un nom d'écran, aucune cote inventée. */
export function emptyFormat(formats: readonly FormatDraft[]): FormatDraft {
  const key = formats.reduce((max, format) => Math.max(max, format.key), 0) + 1;
  return {
    key,
    name: `Format ${formats.length + 1}`,
    outer: EMPTY_DIMENSIONS,
    inner: EMPTY_DIMENSIONS,
    maxStack: null,
  };
}

/**
 * Le corps de la requête, ou la liste des champs encore vides. On n'envoie
 * rien d'incomplet : un zéro inventé ferait répondre le serveur sur une
 * question qu'on ne lui a pas posée.
 */
export function buildPayload(draft: AssistantDraft): BuiltPayload {
  const missing: string[] = [];
  const floor = draft.floor;
  const lengthCm = need(floor.lengthCm, 'longueur du véhicule', missing);
  const widthCm = need(floor.widthCm, 'largeur du véhicule', missing);
  const heightCm = need(floor.heightCm, 'hauteur du véhicule', missing);
  const arches = floor.arches
    ? {
        lengthCm: need(floor.archLengthCm, 'longueur des passages de roue', missing),
        protrusionCm: need(floor.archProtrusionCm, 'saillie des passages de roue', missing),
        fromBackCm: need(floor.archFromBackCm, 'distance des passages de roue au fond', missing),
        ...(floor.archHeightCm === null ? {} : { heightCm: floor.archHeightCm }),
      }
    : null;
  const gapCm = need(draft.gapCm, 'jeu entre bacs', missing);
  const formats = draft.formats.map((format) => ({
    name: format.name,
    outer: dimensions(format.outer, `${label(format)}, extérieur`, missing),
    inner: dimensions(format.inner, `${label(format)}, intérieur`, missing),
    maxStack: need(format.maxStack, `${label(format)}, pile maximale`, missing),
  }));
  if (formats.length === 0) {
    missing.push('au moins un format');
  }
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return {
    ok: true,
    payload: {
      floor: { lengthCm, widthCm, heightCm, wheelArches: arches },
      gapCm,
      formats,
    },
  };
}

function label(format: FormatDraft): string {
  return format.name.trim() === '' ? 'format sans nom' : format.name.trim();
}

function need(value: number | null, name: string, missing: string[]): number {
  if (value === null) {
    missing.push(name);
    return 0;
  }
  return value;
}

function dimensions(
  draft: DimensionsDraft,
  name: string,
  missing: string[],
): { lengthMm: number; widthMm: number; heightMm: number } {
  const before = missing.length;
  const lengthMm = needMm(draft.lengthCm, name, missing);
  const widthMm = needMm(draft.widthCm, name, missing);
  const heightMm = needMm(draft.heightCm, name, missing);
  // Une seule mention par cote incomplète : « Bac M, extérieur » suffit.
  missing.splice(before + 1);
  return { lengthMm, widthMm, heightMm };
}

/**
 * Une cote saisie en cm, envoyée en mm entiers. Plus d'une décimale ne se
 * mesure pas au millimètre : on le dit plutôt que d'arrondir en silence.
 */
function needMm(cm: number | null, name: string, missing: string[]): number {
  const value = need(cm, name, missing);
  if (cm === null) return 0;
  const mm = cmToMm(value);
  if (mm === null) {
    missing.push(`${name} au millimètre près (une décimale)`);
    return 0;
  }
  return mm;
}
