import type {
  VehicleCargoPayload,
  VehicleCargoView,
  VehicleRefrigerationPayload,
  VehicleRefrigerationView,
  VehicleView,
  VehicleWheelArchesPayload,
  VehicleWheelArchesView,
} from '@lfd/contracts';

import { energyBadgeLabel } from './vehicle-energy';

export { ENERGY_LABELS, ENERGY_OPTIONS, energyBadgeLabel, energyLabel } from './vehicle-energy';

/**
 * **Le chargement d'un véhicule** — dimensions utiles et caisse réfrigérée
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 2 bis).
 *
 * Les bornes sont celles du domaine (L2b-C1, L2b-C2), dites AVANT l'envoi pour
 * qu'on corrige sans aller-retour ; le serveur refuse de toute façon, et c'est
 * lui qui fait foi. Ce module ne calcule aucune capacité (L2b-C4) : il saisit
 * et il affiche.
 */

export const CARGO_CM_MIN = 1;
export const CARGO_CM_MAX = 1_000;
export const COLD_LITERS_MIN = 1;
export const COLD_LITERS_MAX = 20_000;
export const COLD_TEMP_MIN = -30;
export const COLD_TEMP_MAX = 15;

const CM3_PER_LITER = 1_000;
const LITERS_PER_M3 = 1_000;

/** La saisie du dialogue, telle que les champs numériques la rendent. */
export interface VehicleLoadDraft {
  readonly lengthCm: number | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
  readonly refrigerated: boolean;
  readonly coldLiters: number | null;
  readonly minTempC: number | null;
  readonly maxTempC: number | null;
  /** Passages de roue (G4) : lus seulement si l'espace utile est renseigné. */
  readonly arches: boolean;
  readonly archLengthCm: number | null;
  readonly archProtrusionCm: number | null;
  readonly archFromBackCm: number | null;
  readonly archHeightCm: number | null;
}

export type VehicleLoadReading =
  | {
      readonly ok: true;
      readonly cargo: VehicleCargoPayload | null;
      readonly wheelArches: VehicleWheelArchesPayload | null;
      readonly refrigeration: VehicleRefrigerationPayload | null;
    }
  | { readonly ok: false; readonly issue: string };

/** Le brouillon d'un véhicule existant — ou vide pour un ajout. */
export function loadDraftOf(vehicle: VehicleView | undefined): VehicleLoadDraft {
  const cargo = vehicle?.cargo ?? null;
  const cold = vehicle?.refrigeration ?? null;
  const arches = vehicle?.wheelArches ?? null;
  return {
    lengthCm: cargo?.lengthCm ?? null,
    widthCm: cargo?.widthCm ?? null,
    heightCm: cargo?.heightCm ?? null,
    refrigerated: cold !== null,
    coldLiters: cold?.volumeLiters ?? null,
    minTempC: cold?.minTempC ?? null,
    maxTempC: cold?.maxTempC ?? null,
    arches: arches !== null,
    archLengthCm: arches?.lengthCm ?? null,
    archProtrusionCm: arches?.protrusionCm ?? null,
    archFromBackCm: arches?.fromBackCm ?? null,
    archHeightCm: arches?.heightCm ?? null,
  };
}

/**
 * Le volume utile en litres, comme le serveur le dérive : L × l × h / 1 000,
 * arrondi à l'entier inférieur.
 */
export function cargoVolumeLiters(lengthCm: number, widthCm: number, heightCm: number): number {
  return Math.floor((lengthCm * widthCm * heightCm) / CM3_PER_LITER);
}

/** Le volume de la saisie en cours, ou `null` tant que les trois ne sont pas là. */
export function draftVolumeLiters(draft: VehicleLoadDraft): number | null {
  const { lengthCm, widthCm, heightCm } = draft;
  if (lengthCm === null || widthCm === null || heightCm === null) return null;
  return cargoVolumeLiters(lengthCm, widthCm, heightCm);
}

const M3 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const LITERS = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** « 3,3 m³ » — un volume utile se lit en mètres cubes. */
export function volumeLabel(liters: number): string {
  return `${M3.format(liters / LITERS_PER_M3)} m³`;
}

/** « 0 », « +4 », « −18 » — le signe dit, pour qu'un froid négatif ne se perde pas. */
export function temperatureLabel(celsius: number): string {
  if (celsius > 0) return `+${String(celsius)}`;
  if (celsius < 0) return `−${String(-celsius)}`;
  return '0';
}

/** « 300 × 170 × 130 cm · 6,6 m³ » */
export function cargoLabel(cargo: VehicleCargoView): string {
  return `${String(cargo.lengthCm)} × ${String(cargo.widthCm)} × ${String(cargo.heightCm)} cm · ${volumeLabel(cargo.volumeLiters)}`;
}

/** « Passages de roue : 90 cm de long, 20 cm par côté, à 60 cm du fond, 30 cm de haut » */
export function wheelArchesLabel(arches: VehicleWheelArchesView): string {
  return `Passages de roue : ${String(arches.lengthCm)} cm de long, ${String(arches.protrusionCm)} cm par côté, à ${String(arches.fromBackCm)} cm du fond, ${String(arches.heightCm)} cm de haut`;
}

/** « ❄ 400 L · 0 à +4 °C » pour une caisse réfrigérée ; « Sec » sinon. */
export function coldLabel(refrigeration: VehicleRefrigerationView | null): string {
  if (refrigeration === null) return 'Sec';
  const { volumeLiters, minTempC, maxTempC } = refrigeration;
  return `❄ ${LITERS.format(volumeLiters)} L · ${temperatureLabel(minTempC)} à ${temperatureLabel(maxTempC)} °C`;
}

/**
 * Le badge discret d'une camionnette dans Planifier et le simulateur :
 * « 6,6 m³ », « 6,6 m³ ❄ », « ❄ », « 6,6 m³ Élec. » — ou `null` quand rien
 * n'est connu, ni froid, ni électrique/hybride.
 */
export function vehicleBadgeLabel(
  vehicle: Pick<VehicleView, 'cargo' | 'refrigeration' | 'energy'>,
): string | null {
  const parts = [
    vehicle.cargo === null ? null : volumeLabel(vehicle.cargo.volumeLiters),
    vehicle.refrigeration === null ? null : '❄',
    energyBadgeLabel(vehicle.energy),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' ');
}

function outOf(value: number, min: number, max: number): boolean {
  return !Number.isInteger(value) || value < min || value > max;
}

function readCargo(draft: VehicleLoadDraft): VehicleLoadReading {
  const { lengthCm, widthCm, heightCm } = draft;
  const given = [lengthCm, widthCm, heightCm].filter((value) => value !== null);
  if (given.length === 0) return { ok: true, cargo: null, wheelArches: null, refrigeration: null };
  if (lengthCm === null || widthCm === null || heightCm === null) {
    return {
      ok: false,
      issue: 'Saisissez la longueur, la largeur et la hauteur — les trois, ou aucune.',
    };
  }
  if ([lengthCm, widthCm, heightCm].some((cm) => outOf(cm, CARGO_CM_MIN, CARGO_CM_MAX))) {
    return {
      ok: false,
      issue: `Chaque dimension est un nombre entier de centimètres, de ${String(CARGO_CM_MIN)} à ${String(CARGO_CM_MAX)}.`,
    };
  }
  return {
    ok: true,
    cargo: { lengthCm, widthCm, heightCm },
    wheelArches: null,
    refrigeration: null,
  };
}

function readCold(
  draft: VehicleLoadDraft,
  usefulLiters: number | null,
): { ok: true; refrigeration: VehicleRefrigerationPayload | null } | { ok: false; issue: string } {
  if (!draft.refrigerated) return { ok: true, refrigeration: null };
  const { coldLiters, minTempC, maxTempC } = draft;
  if (coldLiters === null) return { ok: false, issue: 'Saisissez le volume réfrigéré.' };
  if (outOf(coldLiters, COLD_LITERS_MIN, COLD_LITERS_MAX)) {
    return {
      ok: false,
      issue: `Le volume réfrigéré est un nombre entier de litres, de ${String(COLD_LITERS_MIN)} à ${String(COLD_LITERS_MAX)}.`,
    };
  }
  if (usefulLiters !== null && coldLiters > usefulLiters) {
    return {
      ok: false,
      issue: `Le volume réfrigéré (${LITERS.format(coldLiters)} L) dépasse le volume utile (${LITERS.format(usefulLiters)} L).`,
    };
  }
  if (minTempC === null || maxTempC === null) {
    return { ok: false, issue: 'Saisissez la température minimale et la température maximale.' };
  }
  if ([minTempC, maxTempC].some((c) => outOf(c, COLD_TEMP_MIN, COLD_TEMP_MAX))) {
    return {
      ok: false,
      issue: `Chaque température est un nombre entier de degrés, de ${temperatureLabel(COLD_TEMP_MIN)} à ${temperatureLabel(COLD_TEMP_MAX)} °C.`,
    };
  }
  if (minTempC > maxTempC) {
    return {
      ok: false,
      issue: 'La température minimale ne peut pas dépasser la maximale.',
    };
  }
  return { ok: true, refrigeration: { volumeLiters: coldLiters, minTempC, maxTempC } };
}

/**
 * Les passages de roue : les quatre cotes, ou aucune. Sans espace utile, ils
 * ne partent pas — le serveur les refuserait, et la case est cachée.
 */
function readArches(
  draft: VehicleLoadDraft,
  hasCargo: boolean,
): { ok: true; wheelArches: VehicleWheelArchesPayload | null } | { ok: false; issue: string } {
  if (!hasCargo || !draft.arches) return { ok: true, wheelArches: null };
  const {
    archLengthCm: lengthCm,
    archProtrusionCm: protrusionCm,
    archFromBackCm: fromBackCm,
    archHeightCm: heightCm,
  } = draft;
  if (lengthCm === null || protrusionCm === null || fromBackCm === null || heightCm === null) {
    return {
      ok: false,
      issue:
        'Saisissez la longueur, la saillie, la distance depuis le fond et la hauteur des passages de roue — les quatre.',
    };
  }
  if ([lengthCm, protrusionCm, fromBackCm, heightCm].some((cm) => !Number.isInteger(cm))) {
    return { ok: false, issue: 'Les passages de roue se mesurent en centimètres entiers.' };
  }
  return { ok: true, wheelArches: { lengthCm, protrusionCm, fromBackCm, heightCm } };
}

/**
 * Lit la saisie : la charge à envoyer, ou le premier refus, dans les mots de
 * l'équipe. Une case « Caisse réfrigérée » décochée envoie `null` — les champs
 * restés remplis ne partent pas.
 */
export function readLoad(draft: VehicleLoadDraft): VehicleLoadReading {
  const cargo = readCargo(draft);
  if (!cargo.ok) return cargo;
  const arches = readArches(draft, cargo.cargo !== null);
  if (!arches.ok) return arches;
  const cold = readCold(draft, draftVolumeLiters(draft));
  if (!cold.ok) return cold;
  return {
    ok: true,
    cargo: cargo.cargo,
    wheelArches: arches.wheelArches,
    refrigeration: cold.refrigeration,
  };
}

/**
 * La ligne de la flotte : « 250 × 170 × 130 cm · 5,5 m³ · ❄ 400 L · 0 à +4 °C ».
 *
 * « Sec » n'est dit que si le chargement est RENSEIGNÉ (dimensions connues) :
 * un véhicule d'avant le lot 2 bis a `refrigeration: null` sans que personne
 * ait dit qu'il est sec, et l'afficher « Sec » inventerait un fait. Rien de
 * connu : `null`, et la ligne ne s'affiche pas.
 */
export function vehicleLoadLine(
  vehicle: Pick<VehicleView, 'cargo' | 'refrigeration'>,
): string | null {
  if (vehicle.refrigeration !== null) {
    const cold = coldLabel(vehicle.refrigeration);
    return vehicle.cargo === null ? cold : `${cargoLabel(vehicle.cargo)} · ${cold}`;
  }
  return vehicle.cargo === null ? null : `${cargoLabel(vehicle.cargo)} · Sec`;
}
