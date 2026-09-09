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
import { pricingContextFor } from "../domain/pricing-context.js";
import type { PricingContext } from "../domain/price-rule.js";
import {
  floorsFor,
  materialsOf,
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

    // Quatre lectures pour tout le lot, en parallèle.
    const [rules, floors, ladders, commitments, mercuriale] = await Promise.all([
      this.priceRules.inScopes(scopes),
      this.priceFloors.inScopes(scopes),
      this.volumeLadders.inScopes(scopes),
      // 🔴 La lentille décide, pas la méthode qui posera la question ensuite.
      // Une question `unproven` — l'écran de tarification, la projection — ne
      // peut rien prouver de l'historique d'un client : lire ses engagements
      // serait payer une requête pour un fait qu'on va écarter. La projection le
      // faisait, et l'ignorait ensuite.
      //
      // Un client de passage n'en a pas non plus, et le port le sait sans
      // interroger la base.
      admitsEvidence(lens) ? this.commitments.liveFor(parties.companyId) : [],
      // La mercuriale arrive en OBJET : on ne connaît pas encore la quantité de
      // chaque ligne, donc pas le palier. Cf. `asRuleFor`.
      this.mercuriales.liveFor(parties.companyId, at),
    ]);
    const materials = materialsOf({ rules, floors, ladders, commitments, mercuriale });
    // Sans preuves recevables, il n'y a rien à mesurer — et `NO_EVIDENCE` est la
    // réponse honnête, pas un défaut prudent : la porte d'un plancher dynamique
    // reste alors fermée, ce qui est ce qu'une question sans preuve mérite.
    const evidence = admitsEvidence(lens)
      ? await this.measure(entries, materials, at)
      : NO_EVIDENCE;
    return LoadedPricer.over(materials, evidence, parties, at);
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
          to: commitment.validTo,
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
