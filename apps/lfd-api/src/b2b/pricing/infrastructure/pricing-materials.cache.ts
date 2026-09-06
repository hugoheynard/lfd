import { Injectable } from "@nestjs/common";

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
 * ## 🔴 Ce que ce cache suppose, et qui n'est pas éternel
 *
 * **Une seule instance de l'API.** C'est le cas aujourd'hui, par décision de
 * routage et non par plafond de capacité — cf.
 * `documentation/ops/architecture-deploiement.md` §4 : « Instances max : 1 »,
 * parce que Cloudflare n'offre pas de routage sensible à la charge et que deux
 * instances tirées au sort valent moins qu'une chaude.
 *
 * Le jour où l'on passe à deux, ce cache devient **faux** : une règle posée sur
 * l'instance A n'invalide pas l'instance B, qui continue de facturer l'ancien
 * prix jusqu'à son propre redémarrage. Ce n'est pas une dégradation, c'est un
 * prix faux — et le même document nomme le passage à plusieurs instances comme
 * un levier futur. À ce moment-là, il faut soit une invalidation partagée, soit
 * retirer ce cache.
 */
@Injectable()
export class PricingMaterialsCache {
  private readonly held = new Map<string, Promise<unknown>>();

  /**
   * La table demandée, chargée au plus une fois entre deux écritures.
   *
   * On garde la **promesse** et non son résultat : deux appels concurrents
   * arrivés avant la fin du premier chargement partagent la même lecture, au
   * lieu d'en lancer deux. C'est le cas normal au réveil de l'instance, quand le
   * cron de chauffe et un vrai client se croisent.
   */
  async of<T>(key: string, load: () => Promise<readonly T[]>): Promise<readonly T[]> {
    const held = this.held.get(key);
    if (held !== undefined) {
      return (await held) as readonly T[];
    }
    const loading = load();
    this.held.set(key, loading);
    try {
      return await loading;
    } catch (error) {
      // Une lecture qui échoue ne se garde pas : la suivante doit réessayer,
      // pas hériter d'une promesse rejetée pour toute la vie du processus.
      this.held.delete(key);
      throw error;
    }
  }

  /** Vide tout. Appelé par `PricingActWriter`, après le commit. */
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
