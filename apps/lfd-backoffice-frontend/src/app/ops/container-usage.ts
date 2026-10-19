import type { ContainerUsage, ContainerUsageGap } from '@lfd/ops-contract';

import { elapsedSince } from './elapsed';
import { toneOf, type Occupancy } from './occupancy';

/**
 * **Le CPU et la mémoire du container de l'API**, tels que la carte les dit.
 *
 * Ajouté le 2026-10-19 (Hugo) : la case API portait un pourcentage qui était
 * une pression de latence, et se lisait comme un CPU. Ces chiffres-ci en sont
 * un — lus chez Cloudflare, rapportés à ce que le type d'instance alloue.
 */

/**
 * Le nœud que mesure `containerUsage` : l'API (`b2b` dans la topologie servie
 * par `lfd-api/src/ops/topology/topology.ts`). Un seul container a ses
 * métriques ; le jour où un second en aura, le contrat portera le nœud.
 */
export const CONTAINER_NODE = 'b2b';

/** Ce que la case et la note sous la carte affichent. */
export interface ContainerReading {
  /** Dans la case, en haut à droite — « CPU 12 % · Mém. 8 % », ou l'absence. */
  readonly label: string;
  /** L'infobulle et le lecteur d'écran. */
  readonly sentence: string;
  /** Sous la carte : le délai de remontée, ou la raison de l'absence. */
  readonly note: string;
  /** Vrai si `note` est un échec à signaler, pas une simple fraîcheur. */
  readonly missing: boolean;
}

const GAP_LABEL: Readonly<Record<ContainerUsageGap['reason'], string>> = {
  'not-configured': 'CPU non mesuré',
  'no-samples': 'CPU sans relevé',
  forbidden: 'CPU : jeton sans droit',
  unavailable: 'CPU illisible',
};

/**
 * La lecture à afficher, ou `null` quand le serveur n'a rien dit du tout
 * (une API d'avant ce contrat) : alors la case reste telle qu'elle était.
 */
export function containerReading(
  usage: ContainerUsage | null,
  gap: ContainerUsageGap | null,
  generatedAt: string,
): ContainerReading | null {
  if (usage !== null) {
    const cpu = Math.round(usage.cpuPercent);
    const memory = Math.round(usage.memoryPercent);
    const age = elapsedSince(usage.measuredAt, Date.parse(generatedAt));
    const freshness = age === "à l'instant" ? 'mesuré à l’instant' : `mesuré il y a ${age}`;
    const instances = usage.instances > 1 ? `, ${usage.instances} instances` : '';
    return {
      label: `CPU ${cpu} % · Mém. ${memory} %`,
      sentence: `Container de l’API (${usage.instanceType}${instances}) : CPU ${cpu} % et mémoire ${memory} % de l’allocation, sur ${usage.windowMinutes} min — ${freshness}.`,
      note: `CPU et mémoire de l’API : ${freshness} (Cloudflare remonte à la minute, avec retard).`,
      missing: false,
    };
  }
  if (gap !== null) {
    return {
      label: GAP_LABEL[gap.reason],
      sentence: `CPU et mémoire de l’API indisponibles : ${gap.detail}`,
      note: gap.detail,
      missing: true,
    };
  }
  return null;
}

/**
 * L'occupation qui colore le lien vers l'API : **le pire** de la pression
 * (latence ou rejets), du CPU et de la mémoire.
 *
 * C'est la règle du §13 tenue plus fidèlement, pas contournée : la couleur
 * vient d'un rapport d'occupation de l'instance, jamais d'un volume — et CPU
 * et mémoire en sont le rapport le plus direct. La pression reste dans le
 * maximum parce qu'elle voit ce qu'ils ne voient pas : une file d'attente sur
 * la base fait monter la latence avec un CPU au repos.
 */
export function withContainerUsage(pressure: Occupancy, usage: ContainerUsage | null): Occupancy {
  if (usage === null) {
    return pressure;
  }
  const container = Math.min(1, Math.max(usage.cpuPercent, usage.memoryPercent) / 100);
  if (pressure.basis !== 'aucune mesure' && pressure.ratio >= container) {
    return pressure;
  }
  return { ratio: container, tone: toneOf(container), basis: 'conteneur' };
}
