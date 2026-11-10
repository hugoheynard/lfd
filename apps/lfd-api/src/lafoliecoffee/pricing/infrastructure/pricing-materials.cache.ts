import { Injectable } from "@nestjs/common";

import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CacheOutcomeRecorder } from "../../../platform/metrics/cache-outcome-recorder.js";

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
 * C'était le cas par décision de routage — `documentation/ci-cd/architecture-deploiement.md`
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
 * ### Une estampille par REQUÊTE (2026-11-04)
 *
 * Le partage « en vol » ne couvrait qu'un `Promise.all` : un devis questionne
 * le cache à trois ou quatre moments séparés (prix de ligne, remise du point,
 * promotions panier, offre de connexion), et payait autant d'estampilles —
 * mesuré le 2026-11-04 sur `/shop/quote` : quatre lectures du journal à
 * froid, trois à chaud, sur dix ou quinze.
 *
 * L'estampille se lit désormais **une fois par requête**, gardée sur le
 * contexte de la requête (l'objet même que porte l'AsyncLocalStorage, jamais
 * une clé qu'un client pourrait renvoyer, comme le `traceId`). Une requête a
 * déjà UN instant (`RequestContext.now`) ; elle a maintenant un état du monde
 * tarifaire, lu à sa première question. Hors requête (cron, semis), rien
 * n'est gardé : chaque question relit, comme avant.
 *
 * Pourquoi ça ne sert jamais un prix périmé : une table n'est gardée que sous
 * l'estampille lue AVANT son chargement, donc son contenu est au moins aussi
 * récent que son étiquette. Une requête qui la retrouve sous SA propre
 * estampille lit un état au moins aussi récent que celui qu'elle a constaté ;
 * une requête suivante relit l'estampille et recharge si elle a bougé. Le
 * pire cas est une requête qui finit sur l'état qu'elle a vu en commençant
 * — ce que fait déjà son instant gelé.
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
  /**
   * L'estampille de chaque requête en cours, rangée sous SON contexte — un
   * objet que seule cette requête porte. Faible : la requête finie, l'entrée
   * part avec son contexte.
   */
  private readonly perRequest = new WeakMap<object, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outcomes: CacheOutcomeRecorder,
  ) {}

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
      this.outcomes.record(PRICING_CACHE_NAME, PRICING_CACHE_OUTCOMES.hit);
      return (await held.loading) as readonly T[];
    }
    // Compté par table demandée (C5) : `stamp` quand une écriture — d'ici ou
    // d'une autre instance — a fait bouger l'estampille, `miss` quand rien
    // n'était gardé (démarrage, `invalidate()`, lecture échouée).
    this.outcomes.record(
      PRICING_CACHE_NAME,
      held === undefined ? PRICING_CACHE_OUTCOMES.miss : PRICING_CACHE_OUTCOMES.stamp,
    );
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
   * Le dernier `pricing_events.id` — un ULID, donc croissant. Seuls les ULID
   * comptent (`< ULID_CEILING`) : un acte écrit HORS de l'`IdGenerator`
   * (la reprise des promotions écrit `reprise:posed:<id>`, migration
   * `20261031120000`) trie au-dessus de tout ULID, et figeait l'estampille
   * pour toujours — aucune écriture suivante ne la faisait plus bouger
   * (constaté le 2026-10-30 à la bascule des promotions, L8). `""` quand le
   * journal est vide : c'est un état comme un autre, et il ne se confond avec
   * aucun identifiant réel.
   *
   * ⚠️ Une lecture qui ÉCHOUE ne fait pas tomber la tarification : on retombe
   * sur l'estampille de la dernière lecture réussie, c'est-à-dire sur le
   * comportement d'avant le 2026-09-09. Servir un prix peut-être périmé vaut
   * mieux que ne pas servir de prix — et c'est le seul endroit de cette chaîne
   * où ce compromis est le bon, parce que l'alternative est un refus de vente.
   */
  private stamp(): Promise<string> {
    const request = currentRequestContext();
    if (request === null) {
      return this.freshStamp();
    }
    const held = this.perRequest.get(request);
    if (held !== undefined) {
      return held;
    }
    const reading = this.freshStamp();
    this.perRequest.set(request, reading);
    return reading;
  }

  /** L'estampille relue en base, partagée tant qu'elle est en vol. */
  private async freshStamp(): Promise<string> {
    if (this.pending !== null) {
      return this.pending;
    }
    const reading = this.prisma.pricingEvent
      .findFirst({
        where: { id: { lt: ULID_CEILING } },
        orderBy: { id: "desc" },
        select: { id: true },
      })
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

/**
 * Le premier caractère d'un ULID est `0`–`7` (48 bits de temps en Crockford
 * base 32) : tout ULID trie sous `"8"`, tout identifiant préfixé d'une lettre
 * au-dessus. La borne sert le parcours de l'index de la clé primaire.
 */
const ULID_CEILING = "8";

/** Le nom sous lequel la carte de santé compte ses issues (C5). */
export const PRICING_CACHE_NAME = "pricing.materials";

/** Les issues d'une question au cache : gardée, absente, ou gardée sous une estampille dépassée. */
export const PRICING_CACHE_OUTCOMES = { hit: "hit", miss: "miss", stamp: "stamp_moved" } as const;

/** Les clés, nommées une fois — une faute de frappe ferait deux caches. */
export const PRICING_CACHE_KEYS = {
  rules: "price-rules",
  floors: "price-floors",
  ladders: "volume-ladders",
  // ▸ Les promotions (plan des promotions, L5) : leurs actes s'écrivent dans
  //   `pricing_events` comme ceux des règles, donc l'estampille les couvre.
  //   La source, elle, ne change que par migration ou à la main : après un
  //   `UPDATE promotion_settings` posé à la main (l'ombre sur dev), redémarrer
  //   l'API — aucun acte ne bouge l'estampille.
  linePromotions: "line-promotions",
  basketPromotions: "basket-promotions",
  promotionsSource: "promotions-source",
} as const;
