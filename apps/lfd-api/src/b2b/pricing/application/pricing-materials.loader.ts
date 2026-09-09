import { Injectable } from "@nestjs/common";
import { observedRatioBp } from "@lfd/money";

import { rollingWindows } from "../domain/elasticity-windows.js";
import { CompanyMercurialeReader } from "../domain/ports/company-mercuriale.reader.js";
import { CustomerVolumeReader } from "../domain/ports/customer-volume.reader.js";
import { PriceFloorReader } from "../domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../domain/ports/price-rule.reader.js";
import { SkuVolumeReader } from "../domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../domain/ports/volume-commitment.reader.js";
import { VolumeLadderReader } from "../domain/ports/volume-ladder.reader.js";
import type { CatalogArticle } from "../../catalog/domain/catalogue-article.js";
import { LoadedPricer, type PricingParties } from "../domain/loaded-pricer.js";
import { admitsEvidence, type PriceLens } from "../domain/price-lens.js";
import { readsArchived, type PriceEpoch } from "../domain/price-epoch.js";
import { pricingContextFor } from "../domain/pricing-context.js";
import { pricerOver } from "./pricer-over.js";
import type { PricingContext } from "../domain/price-rule.js";
import {
  floorsFor,
  NO_EVIDENCE,
  type PricingEvidence,
  type PricingMaterials,
} from "../domain/pricing-materials.js";
import { scopesOfAll } from "../domain/pricing-scopes.js";
import { resolveScopedFloor } from "../domain/resolve-floor.js";
import { commitmentFor, type VolumeCommitment } from "../domain/volume-commitment.js";

/** Un article du lot, sa quantité, et la portée qu'il vise. */
interface LotEntry {
  readonly item: CatalogArticle;
  readonly quantity: number;
  /**
   * Le contexte **sans le cumul d'engagement**.
   *
   * Il suffit à tout ce qui se décide avant la mesure : la portée d'un matériau
   * et le plancher qui vise l'article ne dépendent ni de la quantité ni de
   * l'historique — `resolveScopedFloor` ne filtre que par `matchesScope`. C'est
   * cette indépendance qui permet de mesurer EN AMONT, et donc par lot.
   */
  readonly scopeContext: PricingContext;
}

/**
 * **Ce qui va chercher les matériaux et tend le tarificateur.**
 *
 * ## La seule séquence de chargement du dépôt
 *
 * Elle vivait dans `OrderLinePricing`, et quatre autres appelants en avaient
 * écrit chacun une variante — c'est ainsi que deux d'entre eux ont oublié un
 * étage. Ce n'est pas une extraction de confort : tant qu'il y a deux endroits
 * qui décident *quoi lire pour tarifer*, il y a deux réponses possibles à
 * « combien coûte cet article », et c'est celle qui n'est pas la facture que le
 * client conteste.
 *
 * ## Ce qu'elle coûte
 *
 * **Quatre lectures par lot**, quelle que soit sa taille — contre trois par
 * article auparavant, plus celle des engagements. Un panier de vingt lignes en
 * faisait soixante, sur le chemin qui facture.
 *
 * Les deux **mesures** (cumul d'engagement, ratio de volume observé) restent
 * paresseuses : aucune lecture si aucun engagement ne couvre le lot, aucune si
 * aucun plancher n'a de porte de volume. Les mêmes prédicats décident qu'avant ;
 * ils décident simplement en amont, donc une fois plutôt que par article.
 */
@Injectable()
export class PricingMaterialsLoader {
  constructor(
    private readonly priceRules: PriceRuleReader,
    private readonly mercuriales: CompanyMercurialeReader,
    private readonly priceFloors: PriceFloorReader,
    private readonly skuVolumes: SkuVolumeReader,
    private readonly volumeLadders: VolumeLadderReader,
    private readonly commitments: VolumeCommitmentReader,
    private readonly customerVolumes: CustomerVolumeReader,
  ) {}

  /**
   * Le tarificateur pour **ce lot**, ce client, cet instant.
   *
   * `null` sur un lot vide : il n'y a rien à charger, et rendre un tarificateur
   * sans matériaux inviterait à lui poser une question qu'il ne peut pas
   * honorer.
   *
   * 🔴 **Des `CatalogArticle`, pas des `PricedItem`.** C'est ici que la marque
   * mord : le `canonicalMillicents` sur lequel s'appliquent mercuriale, paliers,
   * promotions et plancher doit avoir été **lu** du catalogue. Un article
   * construit à la main n'est plus assignable, et la doctrine du port — « ne
   * jamais faire confiance au prix envoyé par le client » — cesse de reposer sur
   * la seule discipline des appelants (2026-09-09).
   */
  async pricerFor(
    items: readonly { readonly item: CatalogArticle; readonly quantity: number }[],
    parties: PricingParties,
    at: Date,
    lens: PriceLens,
    epoch: PriceEpoch,
  ): Promise<LoadedPricer | null> {
    const entries: LotEntry[] = items.map(({ item, quantity }) => ({
      item,
      quantity,
      scopeContext: pricingContextFor(item.sku, item.category, quantity, parties, at),
    }));
    const scopes = scopesOfAll(entries.map((entry) => entry.scopeContext));
    if (scopes === null) {
      return null;
    }

    // 🔴 L'ÉPOQUE choisit la paire de lectures, une fois pour les cinq.
    //
    // `replay` lit les décisions RANGÉES — celles qui l'ont été après `at` —
    // parce qu'elles agissaient ce jour-là ; et elle **contourne le cache**, qui
    // retient des tables entières pour tous les clients sous une clé qui ne
    // porte que le nom de la table. Une lecture datée qui s'y rangerait servirait
    // des lignes rangées au chemin qui facture.
    //
    // Le choix est fait ici et non dans chaque lecteur : eux n'ont pas
    // d'horloge, et leur faire recalculer la même comparaison serait cinq
    // encodages d'une décision. Cf. `price-epoch.ts`.
    const replay = readsArchived(epoch);

    // Quatre lectures pour tout le lot, en parallèle.
    const [rules, floors, ladders, commitments, mercuriale] = await Promise.all([
      replay ? this.priceRules.inScopesAt(scopes, at) : this.priceRules.inScopes(scopes),
      replay ? this.priceFloors.inScopesAt(scopes, at) : this.priceFloors.inScopes(scopes),
      replay ? this.volumeLadders.inScopesAt(scopes, at) : this.volumeLadders.inScopes(scopes),
      // 🔴 La lentille décide, pas la méthode qui posera la question ensuite.
      // Une question `unproven` — l'écran de tarification, la projection — ne
      // peut rien prouver de l'historique d'un client : lire ses engagements
      // serait payer une requête pour un fait qu'on va écarter. La projection le
      // faisait, et l'ignorait ensuite.
      //
      // Un client de passage n'en a pas non plus, et le port le sait sans
      // interroger la base.
      admitsEvidence(lens)
        ? replay
          ? this.commitments.liveAsOf(parties.companyId, at)
          : this.commitments.liveFor(parties.companyId)
        : [],
      // La mercuriale arrive en OBJET : on ne connaît pas encore la quantité de
      // chaque ligne, donc pas le palier. Cf. `asRuleFor`.
      replay
        ? this.mercuriales.liveAsOf(parties.companyId, at)
        : this.mercuriales.liveFor(parties.companyId, at),
    ]);
    // 🔴 **La fabrique est commune à ce chargeur et aux écrans.** Elle l'est
    // depuis R21 : `LoadedPricer.over` avait deux appelants, et le second — le
    // tableau de tarification — montait `commitments: []` et `NO_EVIDENCE` à la
    // main. Deux fabriques pour une décision qui n'en a qu'une.
    return pricerOver(
      admitsEvidence(lens)
        ? {
            rules,
            floors,
            ladders,
            mercuriale,
            lens: "measured",
            commitments,
            measure: (materials) => this.measure(entries, materials, at),
          }
        : { rules, floors, ladders, mercuriale, lens: "unproven" },
      parties,
      at,
    );
  }

  /**
   * **Ce qu'il faut mesurer**, et rien de plus — mais mesuré par lot.
   *
   * Un lot ordinaire — aucun engagement, aucun plancher à porte de volume — ne
   * coûte **aucune** lecture ici.
   */
  private async measure(
    entries: readonly LotEntry[],
    materials: PricingMaterials,
    at: Date,
  ): Promise<PricingEvidence> {
    const [ordered, ratios] = await Promise.all([
      this.orderedVolumes(entries, materials, at),
      this.volumeRatios(entries, materials, at),
    ]);
    return ordered.size === 0 && ratios.size === 0
      ? NO_EVIDENCE
      : { orderedBySku: ordered, volumeRatioBySku: ratios };
  }

  /**
   * Le cumul déjà commandé, **par engagement**.
   *
   * Groupé par engagement et non par lot : chacun porte SA fenêtre, et une
   * lecture unique sur une fenêtre inventée compterait des commandes hors
   * période. Un lot a zéro ou un engagement dans l'immense majorité des cas,
   * donc ce groupement ne fait pas revenir la boucle qu'on vient de retirer.
   */
  private async orderedVolumes(
    entries: readonly LotEntry[],
    materials: PricingMaterials,
    at: Date,
  ): Promise<ReadonlyMap<string, number>> {
    const bySkus = new Map<string, { commitment: VolumeCommitment; skus: string[] }>();
    for (const { item } of entries) {
      const commitment = commitmentFor(
        materials.commitments,
        { categoryId: item.category, productSku: item.sku, variantSku: item.sku },
        at,
      );
      if (commitment === null) {
        continue;
      }
      const group = bySkus.get(commitment.id);
      if (group === undefined) {
        bySkus.set(commitment.id, { commitment, skus: [item.sku] });
      } else {
        group.skus.push(item.sku);
      }
    }
    if (bySkus.size === 0) {
      return new Map();
    }
    const reads = await Promise.all(
      [...bySkus.values()].map(({ commitment, skus }) =>
        this.customerVolumes.volumesFor(commitment.companyId, skus, {
          from: commitment.validFrom,
          // 🔴 **Borné à l'instant demandé**, et non à la fin de l'engagement.
          //
          // La fenêtre de l'engagement est aussi sa fenêtre de MESURE. Compter
          // jusqu'à sa fin sur une relecture datée revenait à répondre « ce
          // qu'il payait le 3 mars » avec un palier qu'il n'a atteint qu'en
          // novembre — un prix **plausible**, et faux, que rien ne signalait.
          // Même famille que R15 : une preuve qu'on n'était pas en mesure de
          // mesurer à cette date.
          //
          // ⚠️ Au présent, la fenêtre est bornée elle aussi — à l'instant
          // courant, et non au terme de l'engagement. Ce qui ne change pas,
          // c'est le RÉSULTAT : le cumul se compte sur `order.createdAt`, et
          // aucune commande n'est créée dans le futur. Dire « sans effet au
          // présent » serait vrai du résultat et faux de la fenêtre.
          to: earliest(commitment.validTo, at),
        }),
      ),
    );
    return new Map(reads.flatMap((read) => [...read]));
  }

  /**
   * Le ratio de volume observé, **uniquement pour les articles dont un plancher
   * le réclame**.
   *
   * Aucune lecture si aucun plancher n'a de porte, ou si aucune de ces portes ne
   * parle de volume : la très grande majorité des lots ne paie donc rien pour
   * cette mesure. C'est la seule façon d'admettre une lecture d'historique sur le
   * chemin qui facture sans le ralentir pour tout le monde.
   *
   * Les fenêtres sont les MÊMES pour tous les articles — elles ne dépendent que
   * de l'instant —, d'où deux lectures en tout plutôt que deux par article.
   */
  private async volumeRatios(
    entries: readonly LotEntry[],
    materials: PricingMaterials,
    at: Date,
  ): Promise<ReadonlyMap<string, number | null>> {
    const gated = entries
      .filter(({ scopeContext }) => {
        const scoped = resolveScopedFloor(floorsFor(materials, scopeContext), scopeContext);
        return scoped?.policy.dynamic?.unlock.minVolumeRatioBp != null;
      })
      .map(({ item }) => item.sku);
    if (gated.length === 0) {
      return new Map();
    }
    const windows = rollingWindows(at);
    const [baseline, observed] = await Promise.all([
      this.skuVolumes.volumesFor(gated, windows.baseline),
      this.skuVolumes.volumesFor(gated, windows.observed),
    ]);
    return new Map(
      gated.map((sku) => [sku, observedRatioBp(baseline.get(sku) ?? 0, observed.get(sku) ?? 0)]),
    );
  }
}

/**
 * Le plus tôt des deux instants.
 *
 * Nommée plutôt qu'écrite en ligne : c'est une **borne de mesure**, et la
 * confondre avec un `Math.min` sur des millisecondes rendrait le point
 * illisible à la relecture. Elle ne sert qu'à un endroit, et cet endroit est
 * celui où se trompait R17.
 */
function earliest(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}
