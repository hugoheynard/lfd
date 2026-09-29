import type {
  DeclareDeliveryBinsPayload,
  DeliveryBinFreeHalfView,
  DeliveryBinView,
  DeliveryPackingBinView,
  DeliveryPackingLineView,
  DeliveryPackingProposalView,
  DeliveryPackingShareCandidateView,
  DeliveryPackingUnplacedReason,
} from '@lfd/contracts';

/**
 * **Le colisage proposé, en fonctions pures** (`plan-preparation-de-tournee.md`,
 * lot 4 bis, L4b-C4, tranche C). Le serveur calcule la proposition ; on ne fait
 * ici que la DIRE, la traduire en déclarations, et constater un écart avec ce
 * qui a été déclaré — jamais le refuser : la déclaration fait foi.
 *
 * Types seulement de `@lfd/contracts` : une valeur tirerait zod dans le paquet.
 */

/**
 * Au plus tant de bacs entiers par déclaration — la borne du contrat
 * (`DELIVERY_BINS_PER_DECLARATION_MAX`), recopiée pour la même raison.
 */
const MAX_WHOLE_PER_DECLARATION = 20;

/** « 2 × Bac M · ½ Bac M » — une entrée de la proposition. */
export function packingBinLabel(
  bin: Pick<DeliveryPackingBinView, 'binTypeName' | 'whole' | 'half'>,
): string {
  const parts: string[] = [];
  if (bin.whole > 0) {
    parts.push(`${String(bin.whole)} × ${bin.binTypeName}`);
  }
  if (bin.half) {
    parts.push(`½ ${bin.binTypeName}`);
  }
  return parts.join(' · ');
}

/**
 * « 2 × Bac M · ½ Bac S (❄ 1 × Bac S isotherme) » : le sec d'abord, le froid
 * entre parenthèses. Vide s'il n'y a rien à proposer.
 */
export function proposalSummary(bins: readonly DeliveryPackingBinView[]): string {
  const dry = bins
    .filter((bin) => !bin.cold)
    .map(packingBinLabel)
    .join(' · ');
  const cold = bins
    .filter((bin) => bin.cold)
    .map(packingBinLabel)
    .join(' · ');
  if (cold === '') {
    return dry;
  }
  return dry === '' ? `❄ ${cold}` : `${dry} (❄ ${cold})`;
}

/** « 12 × Croissant · 3 × Pain de campagne » — le nom figé de la commande, le SKU à défaut. */
export function packingContentLabel(
  bin: Pick<DeliveryPackingBinView, 'content'>,
  lines: readonly Pick<DeliveryPackingLineView, 'sku' | 'name'>[],
): string {
  return bin.content
    .map((item) => {
      const name = lines.find((line) => line.sku === item.sku)?.name ?? item.sku;
      return `${String(item.quantity)} × ${name}`;
    })
    .join(' · ');
}

/** « Dernier bac rempli à 80 % » — ou « Moitié remplie à … » quand l'entrée finit par une moitié. */
export function packingFillLabel(bin: Pick<DeliveryPackingBinView, 'fill' | 'half'>): string {
  const percent = `${String(Math.round(bin.fill * 100))} %`;
  return bin.half ? `Moitié remplie à ${percent}` : `Dernier bac rempli à ${percent}`;
}

/** Pourquoi un produit n'est pas placé, dit pour le fournil. */
export function unplacedReasonLabel(reason: DeliveryPackingUnplacedReason): string {
  switch (reason) {
    case 'no_capacity':
      return 'sans contenance : renseignez-la dans Livraison › Contenances';
    case 'cold_without_isotherm':
      return 'demande le froid, aucun bac isotherme ne le contient';
  }
}

/**
 * Les entrées de la proposition sans le DERNIER bac de `bins[index]` — un
 * entier de moins, ou sans la moitié (`replacesBinIndex`, v2-4). Une entrée
 * vidée disparaît.
 */
export function withoutReplacedBin(
  bins: readonly DeliveryPackingBinView[],
  index: number,
): readonly DeliveryPackingBinView[] {
  return bins
    .map((bin, at) => {
      if (at !== index) {
        return bin;
      }
      return bin.half ? { ...bin, half: false } : { ...bin, whole: Math.max(0, bin.whole - 1) };
    })
    .filter((bin) => bin.whole > 0 || bin.half);
}

/**
 * **La proposition traduite en déclarations** : une par entrée (un type), les
 * sacs saisis une fois pour tous. Au-delà de la borne d'une déclaration, les
 * entiers se répartissent en plusieurs ; la moitié part avec la dernière.
 */
export function proposalDeclarations(
  orderId: string,
  bins: readonly Pick<DeliveryPackingBinView, 'binTypeId' | 'whole' | 'half'>[],
  innerBags: number,
): readonly DeclareDeliveryBinsPayload[] {
  return bins.flatMap((bin) => {
    const payloads: DeclareDeliveryBinsPayload[] = [];
    let remaining = bin.whole;
    while (remaining > MAX_WHOLE_PER_DECLARATION) {
      payloads.push({
        orderId,
        binTypeId: bin.binTypeId,
        whole: MAX_WHOLE_PER_DECLARATION,
        half: false,
        innerBags,
      });
      remaining -= MAX_WHOLE_PER_DECLARATION;
    }
    if (remaining > 0 || bin.half) {
      payloads.push({
        orderId,
        binTypeId: bin.binTypeId,
        whole: remaining,
        half: bin.half,
        innerBags,
      });
    }
    return payloads;
  });
}

/** Par type : combien d'entiers, combien de moitiés. La clé d'une comparaison. */
function tally(entries: readonly { readonly typeId: string; readonly half: boolean }[]): string {
  const counts = new Map<string, { whole: number; halves: number }>();
  for (const entry of entries) {
    const count = counts.get(entry.typeId) ?? { whole: 0, halves: 0 };
    if (entry.half) {
      count.halves += 1;
    } else {
      count.whole += 1;
    }
    counts.set(entry.typeId, count);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([typeId, count]) => `${typeId}:${String(count.whole)}+${String(count.halves)}`)
    .join('|');
}

/**
 * Les bacs déclarés (vivants) diffèrent-ils de la proposition ? Par type, en
 * entiers et en moitiés. Rien de déclaré = aucun écart : il n'y a encore rien
 * à comparer. ⚠️ Un partage suivi compte comme un écart — la proposition
 * relue ne porte plus le partage qui l'a remplacé ; le rappel reste neutre.
 */
export function declaredDiffersFromProposal(
  declared: readonly Pick<DeliveryBinView, 'voidedAt' | 'half' | 'binType'>[],
  proposed: readonly Pick<DeliveryPackingBinView, 'binTypeId' | 'whole' | 'half'>[],
): boolean {
  const live = declared.filter((bin) => bin.voidedAt === null);
  if (live.length === 0) {
    return false;
  }
  const declaredTally = tally(
    live.map((bin) => ({ typeId: bin.binType.id, half: bin.half !== null })),
  );
  const proposedTally = tally(
    proposed.flatMap((bin) => [
      ...Array.from({ length: bin.whole }, () => ({ typeId: bin.binTypeId, half: false })),
      ...(bin.half ? [{ typeId: bin.binTypeId, half: true }] : []),
    ]),
  );
  return declaredTally !== proposedTally;
}

/** « 2 × Bac M · ½ Bac M » — ce qui est déclaré, dit comme la proposition. */
export function declaredSummary(
  declared: readonly Pick<DeliveryBinView, 'voidedAt' | 'half' | 'binType'>[],
): string {
  const byType = new Map<string, { name: string; whole: number; halves: number }>();
  for (const bin of declared.filter((item) => item.voidedAt === null)) {
    const entry = byType.get(bin.binType.id) ?? { name: bin.binType.name, whole: 0, halves: 0 };
    if (bin.half === null) {
      entry.whole += 1;
    } else {
      entry.halves += 1;
    }
    byType.set(bin.binType.id, entry);
  }
  return [...byType.values()]
    .flatMap((entry) => [
      ...(entry.whole > 0 ? [`${String(entry.whole)} × ${entry.name}`] : []),
      ...(entry.halves === 1 ? [`½ ${entry.name}`] : []),
      ...(entry.halves > 1 ? [`${String(entry.halves)} × ½ ${entry.name}`] : []),
    ])
    .join(' · ');
}

/**
 * « En dernier recours : partager ½ Bac M avec Le Refuge, arrêt 2 — économise
 * un bac ». La moitié partenaire donne le client et l'arrêt ; à défaut (lue
 * ailleurs, ou pas encore), la référence de la commande.
 */
export function shareCandidateLabel(
  candidate: Pick<
    DeliveryPackingShareCandidateView,
    'binTypeName' | 'partnerReference' | 'partnerBinId'
  >,
  halves: readonly Pick<DeliveryBinFreeHalfView, 'binId' | 'customerLabel' | 'position'>[],
): string {
  const partner = halves.find((half) => half.binId === candidate.partnerBinId);
  const who =
    partner === undefined
      ? candidate.partnerReference
      : `${partner.customerLabel}, arrêt ${String(partner.position)}`;
  return `En dernier recours : partager ½ ${candidate.binTypeName} avec ${who} — économise un bac`;
}

/** « CMD-12 · Le Refuge — ½ Bac M, côté droit libre (arrêt 3) » — une moitié libre à partager. */
export function freeHalfLabel(
  half: Pick<
    DeliveryBinFreeHalfView,
    'reference' | 'customerLabel' | 'binTypeName' | 'freeHalf' | 'position'
  >,
): string {
  const side = half.freeHalf === 'left' ? 'gauche' : 'droit';
  return `${half.reference} · ${half.customerLabel} — ½ ${half.binTypeName}, côté ${side} libre (arrêt ${String(half.position)})`;
}

/** La proposition a-t-elle quelque chose à déclarer ? */
export function hasProposedBins(proposal: Pick<DeliveryPackingProposalView, 'bins'>): boolean {
  return proposal.bins.some((bin) => bin.whole > 0 || bin.half);
}
