import { LoadedPricer, type PricingParties } from "../domain/loaded-pricer.js";
import {
  materialsOf,
  NO_EVIDENCE,
  type PricingEvidence,
  type PricingMaterials,
} from "../domain/pricing-materials.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import type { PriceRule, ScopedPriceFloor } from "../domain/price-rule.js";
import type { VolumeCommitment } from "../domain/volume-commitment.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";

/**
 * **La fabrique du tarificateur** — le seul chemin vers `LoadedPricer.over`.
 *
 * ## Ce qu'elle ferme
 *
 * `LoadedPricer.over` avait **deux appelants de production** : le chargeur, qui
 * dérivait ses preuves de la lentille, et l'écran de tarification, qui montait
 * `commitments: []` et `NO_EVIDENCE` **à la main** dans `boardMaterials`.
 *
 * Deux fabriques, donc deux encodages d'une décision qui n'en a qu'une :
 * _cette question a-t-elle le droit de prouver quelque chose ?_ La seconde était
 * juste ; rien ne l'obligeait à le rester. C'est le motif exact par lequel R15
 * s'est glissé — décrit dans `price-lens.ts`, qui recensait **trois** endroits
 * et n'en a fermé que deux.
 *
 * ## 🔴 La lentille n'est pas un paramètre parmi d'autres
 *
 * Elle décide **à la fois** des engagements chargés et des preuves admises, et
 * ces deux-là doivent s'accorder. Les passer séparément, c'est permettre l'état
 * incohérent — des engagements chargés que `NO_EVIDENCE` fait ensuite ignorer,
 * c'est-à-dire une requête payée pour un fait qu'on jette.
 *
 * Ici, `unproven` **ne peut pas** recevoir d'engagements : la signature les
 * refuse. C'est un cran au-dessus de « le chargeur pense à ne pas les lire ».
 *
 * ## Pourquoi elle est `async` alors qu'elle ne lit rien
 *
 * Parce que sous `measured`, **fabriquer entraîne mesurer** : les preuves se
 * calculent sur les matériaux — quels planchers réclament un ratio de volume —,
 * donc après leur assemblage et avant le tarificateur. Rendre la fabrique
 * synchrone obligerait l'appelant à assembler les matériaux une première fois
 * pour mesurer, puis à les laisser réassembler ici : deux indexations par
 * portée sur le chemin qui facture, pour une forme.
 *
 * L'appelant passe donc **comment mesurer**, pas ce qu'il a mesuré. Et la
 * branche `unproven` n'a pas de mesureur à passer — encore une chose qu'elle ne
 * peut pas se tromper à fournir.
 *
 * ⚠️ Le tri se fait sur la lentille **par le type**, et non par
 * `admitsEvidence` : ici, l'union discriminée donne accès ou non aux champs, ce
 * qu'un prédicat booléen ne peut pas faire. `admitsEvidence` reste le bon outil
 * là où la lentille n'ouvre pas une forme mais commande un geste — le chargeur,
 * qui décide de lire ou non les engagements.
 *
 * ⚠️ Elle ne lit rien, et c'est délibéré : c'est une fonction pure, appelée
 * aussi bien par le chargeur (qui a fait ses cinq lectures) que par un écran
 * (qui a fait les siennes). L'injecter en service aurait obligé
 * `board-item.ts` — pur, et testé comme tel — à devenir un service.
 */
export async function pricerOver(
  loaded: {
    readonly rules: readonly PriceRule[];
    readonly floors: readonly ScopedPriceFloor[];
    readonly ladders: readonly VolumeLadder[];
    readonly mercuriale: CompanyMercuriale | null;
  } & (
    | {
        /** `measured` : ce qui a été lu, **et de quoi** mesurer le reste. */
        readonly lens: "measured";
        readonly commitments: readonly VolumeCommitment[];
        readonly measure: (materials: PricingMaterials) => Promise<PricingEvidence>;
      }
    | {
        /**
         * `unproven` : ni engagement ni mesure — et la signature le rend
         * **inexprimable** plutôt que recommandé.
         */
        readonly lens: "unproven";
      }
  ),
  parties: PricingParties,
  at: Date,
): Promise<LoadedPricer> {
  const materials = materialsOf({
    rules: loaded.rules,
    floors: loaded.floors,
    ladders: loaded.ladders,
    mercuriale: loaded.mercuriale,
    commitments: loaded.lens === "measured" ? loaded.commitments : [],
  });
  // Sans preuves recevables, il n'y a rien à mesurer — et `NO_EVIDENCE` est la
  // réponse honnête, pas un défaut prudent : la porte d'un plancher dynamique
  // reste alors fermée, ce qui est ce qu'une question sans preuve mérite.
  const evidence = loaded.lens === "measured" ? await loaded.measure(materials) : NO_EVIDENCE;
  return LoadedPricer.over(materials, evidence, parties, at);
}
