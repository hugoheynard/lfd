import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **Les matériaux de prix, gardés en mémoire entre deux écritures.**
 *
 * ## Ce qu'il garde, et ce qu'il ne garde pas
 *
 * Il garde **les tables entières** — toutes les règles non archivées, tous les
 * planchers, tous les barèmes — et **rien par client**.
 *
 * C'est le point de conception, et il se lit à l'envers de l'intuition. Un
 * cache par client paraît naturel puisque la lecture SQL filtre sur l'audience ;
 * il serait pourtant faux et inutile. **Faux**, parce que la clé devrait aussi
 * porter l'instant (la fenêtre de validité) et les articles du panier — donc
 * une clé différente à presque chaque appel, et un cache qui ne touche jamais.
 * **Inutile**, parce que le filtrage par client est une comparaison
 * d'identifiants sur une liste déjà en mémoire : `inForceFor` le fait en un
 * passage, et `applies` le refait de toute façon.
 *
 * Une copie pour tout le monde, donc, et le tri par requête.
 *
 * ## Pourquoi la portée n'est PAS refiltrée ici
 *
 * La lecture SQL élague sur la portée (`IN` sur les SKU et les familles). Ce
 * cache ne le refait pas : cet élagage existait pour ne pas **transporter** des
 * lignes inutiles depuis Postgres, et il n'y a plus de fil à traverser. La
 * spécificité et la portée sont de toute façon rejugées par la fonction pure —
 * `prisma-price-rule.reader.ts` le dit en toutes lettres : « deux endroits qui
 * filtrent la même chose sont deux endroits à corriger ».
 *
 * Réécrire le prédicat de portée en mémoire aurait donc créé la seconde vérité
 * que ce dépôt refuse partout, pour économiser un `filter` sur quelques
 * centaines de lignes.
 *
 * ## L'invalidation, en un seul endroit
 *
 * `PricingActWriter` est le passage obligé de **toute** écriture tarifaire :
 * état et journal partent dans la même transaction, et un dépôt qui
 * l'éviterait perdrait sa trace — une panne bien plus bruyante qu'un prix
 * périmé. C'est donc là que le cache est vidé, **après** le commit.
 *
 * Après, et pas pendant : vider à l'intérieur de la transaction laisserait une
 * lecture concurrente recharger l'état d'AVANT le commit, et le garder. Le
 * cache serait alors périmé sans que rien ne le rappelle.
 *
 * ## 🔴 L'estampille — ce qui le rend sûr à PLUSIEURS instances
 *
 * Ce cache a supposé **une seule instance de l'API** jusqu'au 2026-09-09.
 * C'était le cas par décision de routage — `documentation/ops/architecture-deploiement.md`
 * §4, « Instances max : 1 » — et non par plafond de capacité. Le jour du passage
 * à deux, il serait devenu **faux** : une règle posée sur l'instance A
 * n'invalide pas l'instance B, qui aurait continué de facturer l'ancien prix
 * jusqu'à son propre redémarrage. Pas une lenteur : un prix faux.
 *
 * Il porte désormais une **estampille** — le dernier identifiant du journal
 * tarifaire, qui est un ULID donc croissant. Toute écriture tarifaire passe par
 * `PricingActWriter`, qui écrit son acte dans la même transaction que l'état :
 * l'estampille bouge donc si et seulement si quelque chose a changé, **quelle
 * que soit l'instance qui l'a écrit**.
 *
 * ### Ce que ça coûte, dit franchement
 *
 * **Une lecture par rafale** au lieu de zéro. C'est un vrai prix, payé sur le
 * chemin qui facture, et il faut le mettre en face de ce qu'il achète : sans
 * cache, ces trois tables coûtent **trois** lectures ; avec estampille, une. Le
 * cache reste donc gagnant de deux lectures, et il devient *correct* au lieu
 * d'être correct-par-hypothèse-de-déploiement.
 *
 * La lecture en vol est **partagée** : les trois lecteurs sont appelés dans un
 * même `Promise.all` par `PricingMaterialsLoader`, et ne paient donc qu'une
 * estampille à eux trois. Elle est oubliée une fois résolue — la garder ferait
 * revenir exactement le problème qu'elle résout, à une fenêtre près.
 *
 * ### `invalidate()` n'est pas devenu inutile
 *
 * Il reste le chemin **court** : après sa propre écriture, une instance n'a pas
 * à attendre de relire une estampille pour savoir qu'elle est périmée. Il évite
 * une lecture, il ne porte plus la correction.
 */
@Injectable()
export class PricingMaterialsCache {
  private readonly held = new Map<string, { stamp: string; loading: Promise<unknown> }>();
  /**
   * La lecture d'estampille **en vol**, partagée puis oubliée.
   *
   * Partagée : trois lecteurs dans un même `Promise.all` ne paient qu'une
   * lecture. Oubliée : la garder au-delà de sa résolution rouvrirait la fenêtre
   * de péremption que cette estampille existe pour fermer.
   */
  private pending: Promise<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * La table demandée, chargée au plus une fois entre deux écritures.
   *
   * On garde la **promesse** et non son résultat : deux appels concurrents
   * arrivés avant la fin du premier chargement partagent la même lecture, au
   * lieu d'en lancer deux. C'est le cas normal au réveil de l'instance, quand le
   * cron de chauffe et un vrai client se croisent.
   */
  async of<T>(key: string, load: () => Promise<readonly T[]>): Promise<readonly T[]> {
    const stamp = await this.stamp();
    const held = this.held.get(key);
    // L'estampille d'abord, la promesse ensuite : une table gardée sous une
    // estampille périmée a peut-être été réécrite par une AUTRE instance, et
    // c'est le seul cas que ce cache ne savait pas voir.
    if (held !== undefined && held.stamp === stamp) {
      return (await held.loading) as readonly T[];
    }
    const loading = load();
    this.held.set(key, { stamp, loading });
    try {
      return await loading;
    } catch (error) {
      // Une lecture qui échoue ne se garde pas : la suivante doit réessayer,
      // pas hériter d'une promesse rejetée pour toute la vie du processus.
      this.held.delete(key);
      throw error;
    }
  }

  /**
   * **L'état du monde tarifaire, en un identifiant.**
   *
   * Le dernier `pricing_events.id` — un ULID, donc croissant. `""` quand le
   * journal est vide : c'est un état comme un autre, et il ne se confond avec
   * aucun identifiant réel.
   *
   * ⚠️ Une lecture qui ÉCHOUE ne fait pas tomber la tarification : on retombe
   * sur l'estampille de la dernière lecture réussie, c'est-à-dire sur le
   * comportement d'avant le 2026-09-09. Servir un prix peut-être périmé vaut
   * mieux que ne pas servir de prix — et c'est le seul endroit de cette chaîne
   * où ce compromis est le bon, parce que l'alternative est un refus de vente.
   */
  private async stamp(): Promise<string> {
    if (this.pending !== null) {
      return this.pending;
    }
    const reading = this.prisma.pricingEvent
      .findFirst({ orderBy: { id: "desc" }, select: { id: true } })
      .then((row) => row?.id ?? "")
      .catch(() => this.lastKnown)
      .finally(() => {
        this.pending = null;
      });
    this.pending = reading;
    const stamp = await reading;
    this.lastKnown = stamp;
    return stamp;
  }

  /** La dernière estampille lue avec succès — le repli quand la lecture échoue. */
  private lastKnown = "";

  /**
   * Vide tout. Appelé par `PricingActWriter`, après le commit.
   *
   * Le chemin **court** : après sa propre écriture, une instance sait qu'elle
   * est périmée sans avoir à relire l'estampille. Depuis le 2026-09-09, ce
   * n'est plus ce qui porte la correction — l'estampille s'en charge, y compris
   * pour les écritures venues d'ailleurs.
   */
  invalidate(): void {
    this.held.clear();
  }
}

/** Les clés, nommées une fois — une faute de frappe ferait deux caches. */
export const PRICING_CACHE_KEYS = {
  rules: "price-rules",
  floors: "price-floors",
  ladders: "volume-ladders",
} as const;
