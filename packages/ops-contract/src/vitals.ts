/**
 * **Ce qu'une vraie personne a vécu**, dans son navigateur.
 *
 * C'est la seule famille de mesures qui ne vient ni de nous, ni d'un tiers, mais
 * du client. Elle comble le trou nommé au §18 : la sonde dit qu'un front est
 * *servi*, jamais qu'il *démarre*, encore moins qu'il est agréable.
 *
 * Trois mesures et pas une de plus — les Core Web Vitals. Chacune répond à une
 * question qu'on peut se poser à voix haute :
 *
 * - **LCP** : « quand est-ce que je vois quelque chose d'utile ? »
 * - **INP** : « quand je clique, ça répond quand ? »
 * - **CLS** : « est-ce que le bouton se dérobe sous mon doigt ? »
 */

export const WEB_VITALS = ["LCP", "INP", "CLS"] as const;
export type WebVitalName = (typeof WEB_VITALS)[number];

/** Vrai si cette valeur est une mesure que ce contrat connaît. */
export function isWebVitalName(value: unknown): value is WebVitalName {
  return typeof value === "string" && WEB_VITALS.some((name) => name === value);
}

/**
 * Ce qu'un navigateur envoie. **Aucune donnée personnelle** : ni identifiant, ni
 * adresse, ni chemin visité — le chemin trahirait la page qu'une personne
 * regarde, et on n'a pas besoin de le savoir pour dire si le front est lent.
 *
 * `front` doit être l'identifiant d'un nœud de la topologie. Un identifiant
 * inconnu est **jeté** : le navigateur ne décide pas de ce qui figure sur la
 * carte.
 */
export interface WebVitalSample {
  readonly front: string;
  readonly metric: WebVitalName;
  /** Millisecondes pour LCP et INP ; score sans unité pour CLS. */
  readonly value: number;
}

/**
 * Les seuils publics des Core Web Vitals, appliqués au **75ᵉ centile** des
 * visites — jamais à la moyenne, qu'une poignée de visites rapides suffit à
 * rendre flatteuse.
 */
export const VITAL_THRESHOLDS: Readonly<
  Record<WebVitalName, { readonly good: number; readonly poor: number; readonly unit: string }>
> = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  INP: { good: 200, poor: 500, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "" },
};

/**
 * Bornes de vraisemblance. La route de collecte est **publique** — elle doit
 * l'être, un visiteur de la boutique n'a pas de jeton — donc n'importe qui peut
 * y poster. On borne pour qu'au pire on fausse un chiffre, jamais pour qu'on
 * fasse exploser une échelle ou une mémoire.
 */
export const VITAL_MAX: Readonly<Record<WebVitalName, number>> = {
  LCP: 60_000,
  INP: 60_000,
  CLS: 10,
};

/** Le verdict d'une valeur, au vocabulaire des Core Web Vitals. */
export function vitalVerdict(metric: WebVitalName, value: number): "good" | "fair" | "poor" {
  const { good, poor } = VITAL_THRESHOLDS[metric];
  if (value <= good) {
    return "good";
  }
  return value <= poor ? "fair" : "poor";
}
