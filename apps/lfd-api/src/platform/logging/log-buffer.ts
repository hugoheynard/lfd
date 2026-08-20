/**
 * Les **dernières lignes d'incident**, gardées en mémoire par l'instance.
 *
 * Elle existe parce que la plateforme ne rend pas ce que le container écrit :
 * l'API `Container` n'expose que la sortie du process (`monitor()`), aucun flux
 * `stdout`, et l'observabilité du Worker ne capte que le Worker. Le 2026-08-16,
 * un `500` reproductible a résisté une demi-journée alors que sa cause était
 * journalisée à chaque tentative, dans un fichier que rien ne lisait.
 *
 * **Ce n'est pas un système de journalisation.** C'est un tampon borné, vivant,
 * perdu au redémarrage, propre à l'instance qui répond. Il répond à une seule
 * question — « que vient-il de se passer ? » — et c'est exactement la question
 * qu'on se pose pendant un incident. La conservation durable est un autre sujet,
 * qui suppose une table, une rétention et une politique de données ; le jour où
 * il faudra expliquer une panne de la nuit, il faudra le faire.
 *
 * **Pur et sans dépendance** : il ne lit ni l'horloge, ni l'environnement. La
 * date arrive avec l'entrée, ce qui permet de l'éprouver en énumérant les cas.
 */

/** Ce qu'on garde d'une ligne : de quoi comprendre, pas de quoi rejouer. */
export interface RecordedLog {
  /** ISO 8601, fournie par l'appelant. */
  readonly at: string;
  readonly level: "error" | "warn";
  /** Le contexte Nest (nom de classe), ou `null` quand il n'y en a pas. */
  readonly context: string | null;
  readonly message: string;
  /**
   * Le `traceId` de la requête qui a produit cette ligne, ou `null` hors
   * requête (démarrage, tâche de fond).
   *
   * C'est ce qui transforme un tampon en **récit** : trois lignes d'erreur sans
   * fil sont trois incidents possibles ; avec le même `traceId`, c'est un seul,
   * et on le suit du premier symptôme à sa cause. C'est aussi le même
   * identifiant que le client reçoit dans `requestId` — « ça a planté, voilà le
   * code » devient une recherche, pas une enquête.
   *
   * Fourni **par l'appelant**, comme la date : ce tampon ne lit ni l'horloge ni
   * l'`AsyncLocalStorage`, c'est ce qui permet de l'éprouver en énumérant.
   */
  readonly traceId: string | null;
}

/**
 * Tampon circulaire : au-delà de la capacité, la plus ancienne sort.
 *
 * Borné **par construction** et non par convention : un tampon qui grandit sans
 * fin dans un process qui ne redémarre pas est une fuite mémoire déguisée en
 * outil de diagnostic.
 */
export class LogBuffer {
  private readonly entries: RecordedLog[] = [];

  constructor(private readonly capacity: number) {}

  record(entry: RecordedLog): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  /**
   * Les plus **récentes d'abord** — un incident se lit à l'envers du temps : on
   * part de ce qui vient d'échouer, pas de ce qui allait bien il y a une heure.
   */
  recent(limit: number): readonly RecordedLog[] {
    const wanted = Math.max(0, Math.min(limit, this.entries.length));
    return this.entries.slice(this.entries.length - wanted).reverse();
  }

  size(): number {
    return this.entries.length;
  }
}

/**
 * Le tampon de l'instance.
 *
 * Un singleton de module, à contre-courant du reste de l'application où tout
 * passe par l'injection. La raison est concrète : le logger de Nest est posé à
 * la **création** de l'application (`NestFactory.create`), avant que le
 * conteneur d'injection n'existe. Le faire résoudre par la DI demanderait de
 * retarder la capture, donc de perdre précisément les lignes du démarrage —
 * celles qui disent ce que l'instance ne saura pas faire.
 */
export const RECENT_LOGS = new LogBuffer(300);
