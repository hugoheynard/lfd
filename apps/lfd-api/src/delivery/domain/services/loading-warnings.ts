import type { LoadingVolume, PlanUnit, PlanVehicle } from "./loading-volume.js";

export type LoadingWarningKind =
  "dry_over" | "cold_over" | "cold_bins_without_refrigeration" | "unknown_cargo" | "bin_to_redo";

/** Une alerte du plan : son genre, et la phrase lue au dépôt. */
export interface LoadingWarning {
  readonly kind: LoadingWarningKind;
  readonly message: string;
}

/**
 * Les alertes du plan (v2-5, v2-4) : chacune nomme le cas réel et le geste
 * de sortie. Un volume utile inconnu n'est JAMAIS lu comme « ça tient » :
 * `unknown_cargo` le dit, que la tournée ait des bacs ou non.
 */
export function loadingWarningsOf(
  units: readonly PlanUnit[],
  vehicle: PlanVehicle,
  volume: LoadingVolume,
): readonly LoadingWarning[] {
  const vehicleName = `« ${vehicle.name} »`;
  const warnings: LoadingWarning[] = [];
  if (volume.dryCapacityLiters === null) {
    warnings.push({
      kind: "unknown_cargo",
      message: `Les dimensions utiles de ${vehicleName} ne sont pas renseignées : impossible de dire si les bacs tiennent. Renseignez-les dans la flotte.`,
    });
  } else if (volume.dryOver) {
    warnings.push({
      kind: "dry_over",
      message: `Les bacs secs occupent ${volume.dryLiters} L pour ${volume.dryCapacityLiters} L disponibles dans ${vehicleName} : ${volume.dryLiters - volume.dryCapacityLiters} L de trop. Déplacez un arrêt vers une autre tournée.`,
    });
  }
  if (volume.coldCapacityLiters !== null && volume.coldOver) {
    warnings.push({
      kind: "cold_over",
      message: `Les bacs isothermes occupent ${volume.coldLiters} L pour ${volume.coldCapacityLiters} L de caisse réfrigérée dans ${vehicleName} : ${volume.coldLiters - volume.coldCapacityLiters} L de trop. Déplacez un arrêt vers une autre tournée.`,
    });
  }
  if (volume.coldBinsWithoutRefrigeration > 0) {
    warnings.push({
      kind: "cold_bins_without_refrigeration",
      message: `${volume.coldBinsWithoutRefrigeration} bac(s) isotherme(s) partent dans ${vehicleName}, qui n'a pas de caisse réfrigérée : ils sont comptés au sec. Confiez ces arrêts à un véhicule réfrigéré, ou assurez le froid autrement.`,
    });
  }
  return [...warnings, ...redoWarnings(units)];
}

/** Une alerte par bac PHYSIQUE partagé à refaire. */
function redoWarnings(units: readonly PlanUnit[]): readonly LoadingWarning[] {
  return units.flatMap((unit) => {
    const toRedo = unit.bins.filter((bin) => bin.toRedo);
    const first = toRedo[0];
    if (first === undefined) {
      return [];
    }
    const codes = toRedo.map((bin) => bin.code).join(" / ");
    const partner = first.partner === null ? "" : ` (partagé avec ${first.partner.reference})`;
    return [
      {
        kind: "bin_to_redo" as const,
        message: `Le bac partagé ${codes}${partner} n'est plus entre deux arrêts consécutifs : recolisez-le ou remettez les arrêts côte à côte.`,
      },
    ];
  });
}
