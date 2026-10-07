import {
  type BinTypeView,
  PURCHASE_ASSISTANT_MAX_FORMATS,
  type PurchaseAssistantFormatView,
  type PurchaseAssistantPayload,
  type PurchaseAssistantRowView,
  type VehicleView,
} from '@lfd/contracts';

import { centimetres, cmToMm, MM_PER_CM, mmToCm } from './delivery-bins';

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

/** L'index du format qui donne le plus de volume utile, ou `null` si aucun n'en donne. */
export function bestFormatIndex(formats: readonly PurchaseAssistantFormatView[]): number | null {
  let best: number | null = null;
  let bestLiters = 0;
  for (const [index, format] of formats.entries()) {
    if (format.usefulLiters > bestLiters) {
      best = index;
      bestLiters = format.usefulLiters;
    }
  }
  return best;
}

/** « 432 L » sous le mètre cube, « 1,23 m³ » au-delà. */
export function formatLiters(liters: number): string {
  const LITERS_PER_CUBIC_METER = 1000;
  if (liters < LITERS_PER_CUBIC_METER) {
    return `${liters} L`;
  }
  return `${(liters / LITERS_PER_CUBIC_METER).toFixed(2).replace('.', ',')} m³`;
}

/**
 * Un bac dessiné sur le plancher vu de dessus, en cm (le plancher en est), jeu
 * retiré. Les cotes du format arrivent en mm et ne sont converties qu'ici.
 */
export interface PlacedBin {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly across: number;
  readonly turned: boolean;
}

/**
 * Les bacs de chaque rangée rendue par le serveur, centrés dans la largeur.
 * Un passage de roue est symétrique : centrer une rangée qui le touche la
 * garde entre les deux.
 */
export function placeBins(
  rows: readonly PurchaseAssistantRowView[],
  outer: { readonly lengthMm: number; readonly widthMm: number },
  floorWidthCm: number,
  gapCm: number,
): readonly PlacedBin[] {
  return rows.flatMap((row) => {
    const turned = row.orientation === 'turned';
    const across = mmToCm(turned ? outer.lengthMm : outer.widthMm) + gapCm;
    const top = (floorWidthCm - row.count * across) / 2;
    return Array.from({ length: row.count }, (_, index) => ({
      x: row.fromCm + gapCm / 2,
      y: top + index * across + gapCm / 2,
      depth: Math.max(1, row.depthCm - gapCm),
      across: Math.max(1, across - gapCm),
      turned,
    }));
  });
}

/** Une bande latérale d'une rangée sur passage : là où des bacs sont empilés au-dessus. */
export interface OverArchBand {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly across: number;
}

/**
 * Les bandes latérales des rangées qui portent des bacs au-dessus des passages
 * de roue (G-D2 bis) : de chaque côté, la largeur que les colonnes centrales
 * laissent libre au sol. Les bacs eux-mêmes ne sont pas dessinés — seulement
 * la place qu'ils prennent, à un étage que le plan de dessus ne montre pas.
 */
export function overArchBands(
  rows: readonly PurchaseAssistantRowView[],
  outer: { readonly lengthMm: number; readonly widthMm: number },
  floorWidthCm: number,
  gapCm: number,
): readonly OverArchBand[] {
  return rows
    .filter((row) => row.overArchCount > 0)
    .flatMap((row) => {
      const across = mmToCm(row.orientation === 'turned' ? outer.lengthMm : outer.widthMm) + gapCm;
      const side = Math.max(0, (floorWidthCm - row.count * across) / 2);
      return [
        { x: row.fromCm, y: 0, depth: row.depthCm, across: side },
        { x: row.fromCm, y: floorWidthCm - side, depth: row.depthCm, across: side },
      ];
    });
}

/** Le premier étage (0 = le sol) où commencent les bacs au-dessus des passages, ou `null`. */
export function overArchFirstLevel(rows: readonly PurchaseAssistantRowView[]): number | null {
  const levels = rows
    .filter((row) => row.overArchCount > 0)
    .map((row) => row.overArchFromLevel)
    .filter((level): level is number => level !== null);
  return levels.length === 0 ? null : Math.min(...levels);
}

/**
 * « 12,5 cm libres au-dessus » : le plafond moins les étages — le bac mesuré
 * en mm, le plancher en cm.
 */
export function freeAboveLabel(floorHeightCm: number, levels: number, binHeightMm: number): string {
  return `${centimetres(floorHeightCm * MM_PER_CM - levels * binHeightMm)} cm libres au-dessus`;
}

/**
 * « 16 au sol × 6 étages », et « + 8 au-dessus des passages » dès que des bacs
 * latéraux s'ajoutent : le total n'est plus alors le produit des deux.
 */
export function resultSubtitle(view: PurchaseAssistantFormatView): string {
  const levels = `${view.levels} étage${view.levels > 1 ? 's' : ''}`;
  const base = `${view.floorCount} au sol × ${levels}`;
  const overArch = view.total - view.floorCount * view.levels;
  return overArch > 0 ? `${base} + ${overArch} au-dessus des passages` : base;
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
