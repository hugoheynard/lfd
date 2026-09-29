import { SIMULATION_SCENARIO_NAME_MAX_LENGTH } from "../entities/simulation-scenario.js";

/** Au-delà, on cesse de chercher : c'est qu'on duplique en boucle, pas qu'on travaille. */
export const COPY_NAME_ATTEMPTS = 50;

/**
 * Les noms qu'une copie peut prendre, dans l'ordre : « X (copie) », puis
 * « X (copie 2) », « X (copie 3) »… Le nom d'origine est rogné pour que le
 * suffixe tienne dans la borne — une copie ne doit jamais être refusée pour
 * un nom trop long qu'on a fabriqué soi-même.
 */
export function copyNameCandidates(source: string): readonly string[] {
  return Array.from({ length: COPY_NAME_ATTEMPTS }, (_, index) => {
    const suffix = index === 0 ? " (copie)" : ` (copie ${String(index + 1)})`;
    const base = source.slice(0, SIMULATION_SCENARIO_NAME_MAX_LENGTH - suffix.length).trimEnd();
    return `${base}${suffix}`;
  });
}
