/** Un dépôt refusé, tel qu'on l'inscrit. */
export interface RefusedDeposit {
  /**
   * Le nom du fichier, tel que le navigateur l'a envoyé.
   *
   * 🔴 **Donnée d'utilisateur.** Plafonnée à l'écriture, et jamais interpolée
   * dans un message d'erreur sans échappement. C'est pourtant la seule chose
   * qui permette de le retrouver sur le disque de celui qui l'a déposé — donc
   * on la garde, et on la traite comme ce qu'elle est.
   */
  readonly fileName: string;
  /** La phrase FRANÇAISE du refus, telle que l'appelant l'a reçue. */
  readonly reason: string;
  /** Le code du refus — pour compter les causes sans statistiquer une phrase. */
  readonly code: string;
  /**
   * Ce qu'on a pu CONSTATER des octets.
   *
   * ⚠️ Trois états qu'on ne confond pas : un nombre (mesuré), `null` (pas
   * mesurable — un refus pour type non supporté n'a, par construction, pas de
   * type constaté), et l'absence de ligne (pas de refus).
   */
  readonly bytes: number | null;
  readonly contentType: string | null;
}

/** Un refus, tel qu'on le relit. */
export interface LoggedFailure extends RefusedDeposit {
  readonly id: string;
  /** `null` hors requête : un script n'a pas d'acteur, et « système » mentirait. */
  readonly actorName: string | null;
  readonly occurredAt: Date;
}

/**
 * **L'historique des dépôts refusés.**
 *
 * 🔴 Il existe parce que le compte rendu d'un import en lot vivait en MÉMOIRE :
 * l'écran gardait le nom et la raison de chaque refus, et fermer l'onglet
 * l'effaçait. Sur un lot de cinquante fichiers, « qu'est-ce qui n'est pas
 * entré hier » n'avait aucune réponse.
 *
 * 🔴 **Ce n'est pas le journal**, et la distinction porte : le journal raconte
 * la vie des images qui EXISTENT ; ces lignes racontent des tentatives, dont
 * le sujet n'existe pas. Les verser au même flux donnerait un `subjectId` qui
 * ne désigne rien.
 *
 * ⚠️ **On ne garde pas les octets, et on ne le pourra jamais** : un fichier
 * refusé n'a, par définition, pas été stocké. Cet historique dit QUOI
 * retrouver et POURQUOI ça a échoué ; il ne permet pas de rejouer. Rejouer
 * demande les octets, que seul le navigateur détient — c'est la file en
 * mémoire de l'écran qui le fait, et elle reste le seul endroit d'où c'est
 * possible. Proposer « réessayer » sur une ligne d'ici serait promettre un
 * geste qu'on ne peut pas tenir.
 */
export abstract class MediaFailureLog {
  /**
   * Inscrit un refus.
   *
   * 🔴 **Dans sa PROPRE unité de travail**, et jamais dans celle du dépôt : le
   * refus est levé AVANT que la transaction d'inscription s'ouvre, et l'y
   * ranger la ferait emporter par le rollback. L'historique serait alors vide
   * précisément les jours où il sert.
   *
   * ⚠️ Et il ne **relance jamais**. Un historique qui ferait échouer un dépôt
   * déjà refusé changerait le message reçu par l'écran — qui perdrait la
   * raison du refus au profit d'une panne d'écriture. C'est l'inverse du
   * service rendu.
   */
  abstract record(failure: RefusedDeposit): Promise<void>;

  /** Les derniers refus, du plus récent au plus ancien. */
  abstract recent(limit: number): Promise<readonly LoggedFailure[]>;

  /**
   * Oublie ce qui est plus vieux que `before`, et rend le nombre de lignes
   * effacées.
   *
   * Une table d'historique qui ne se vide jamais devient une dette silencieuse,
   * et un refus de l'an dernier n'apprend plus rien — le fichier n'existe plus
   * sur le disque de personne.
   */
  abstract forgetBefore(before: Date): Promise<number>;
}
