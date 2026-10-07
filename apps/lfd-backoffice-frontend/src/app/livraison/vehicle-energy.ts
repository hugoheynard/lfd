import { VEHICLE_ENERGIES } from '@lfd/contracts';
import type { VehicleEnergy } from '@lfd/contracts';

/**
 * **Les mots de l'énergie d'un véhicule** — sortis de `vehicle-load.ts`, qui
 * saisit le chargement : l'énergie se choisit et s'affiche, elle ne se mesure
 * pas, et ses lecteurs (dialogue, flotte, badges) ne lisent qu'elle.
 */

/** Les mots de l'énergie, indexés par la valeur du contrat. */
export const ENERGY_LABELS: Readonly<Record<VehicleEnergy, string>> = {
  electric: 'Électrique',
  hybrid: 'Hybride',
  diesel: 'Diesel',
  petrol: 'Essence',
  gas: 'Gaz (GNV/GPL)',
};

/** Les choix du dialogue ; « Non renseignée » est l'absence de choix (`null`). */
export const ENERGY_OPTIONS: readonly { readonly value: VehicleEnergy; readonly label: string }[] =
  VEHICLE_ENERGIES.map((value) => ({
    value,
    label: ENERGY_LABELS[value],
  }));

/** Ce qu'affiche la flotte — rien quand personne ne l'a dit : on n'invente pas. */
export function energyLabel(energy: VehicleEnergy | null): string | null {
  return energy === null ? null : ENERGY_LABELS[energy];
}

/**
 * Le mot court du badge : seulement l'électrique et l'hybride, dont
 * l'autonomie compte en montagne. Le thermique et l'inconnu ne disent rien.
 */
export function energyBadgeLabel(energy: VehicleEnergy | null): string | null {
  if (energy === 'electric') return 'Élec.';
  if (energy === 'hybrid') return 'Hybride';
  return null;
}
