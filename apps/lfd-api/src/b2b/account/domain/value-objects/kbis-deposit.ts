/** Le fichier déposé — le contenu, lui, vit dans le stockage objet (R2). */
export interface KbisFile {
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  /**
   * Quand il a été déposé. Vient du `Clock` de la requête, pas d'un `new Date()`
   * de l'adaptateur — c'est un fait métier (« ces papiers datent de quand ? »),
   * pas un horodatage technique.
   */
  readonly uploadedAt: Date;
}

/** Qui a certifié, et quand. Le nom et le titre sont figés à cet instant. */
export interface KbisCertification {
  /** L'instant du geste — jamais résolu à la lecture : une trace dit ce qui était vrai ce jour-là. */
  readonly at: Date;
  /** Le `sub` du token staff — l'identifiant qui survit à un changement de nom. */
  readonly bySub: string;
  /** Instantané du nom d'usage, vide si le `sub` n'est dans aucune fiche. */
  readonly byName: string;
  /** Instantané du périmètre, vide de même. */
  readonly byRole: string;
}

/**
 * **Un extrait KBIS déposé, et l'éventuelle parole d'un agent dessus.**
 *
 * L'objet existe pour rendre une règle **structurelle** au lieu de la répéter :
 * *un nouveau fichier n'est jamais certifié*. Elle vivait dans l'adaptateur
 * Prisma, qui remettait quatre colonnes à `null` en même temps qu'il écrivait
 * les métadonnées, avec un commentaire pour l'expliquer. Ici, `deposit()`
 * construit simplement un dépôt **sans** certification : il n'y a plus de remise
 * à zéro à écrire, donc plus de remise à zéro à oublier.
 *
 * Immuable : certifier ou décertifier rend un **nouveau** dépôt. Une parole
 * d'agent ne se corrige pas en place.
 */
export class KbisDeposit {
  private constructor(
    private readonly fileValue: KbisFile,
    private readonly certificationValue: KbisCertification | null,
  ) {}

  /**
   * Un extrait qui vient d'être déposé — **jamais certifié**, par construction.
   *
   * C'est le point de toute la classe : un remplacement d'extrait passe par ici,
   * et repart donc sans la parole donnée sur le précédent.
   */
  static deposit(file: KbisFile): KbisDeposit {
    return new KbisDeposit(file, null);
  }

  /** Rehydrate depuis la base — les colonnes de certification, ou leur absence. */
  static reconstitute(file: KbisFile, certification: KbisCertification | null): KbisDeposit {
    return new KbisDeposit(file, certification);
  }

  get file(): KbisFile {
    return this.fileValue;
  }

  /** La parole donnée, ou `null` : déposé mais pas encore vérifié. */
  get certification(): KbisCertification | null {
    return this.certificationValue;
  }

  get certified(): boolean {
    return this.certificationValue !== null;
  }

  /** Un agent a ouvert l'extrait, l'a comparé, et engage sa parole. */
  certify(certification: KbisCertification): KbisDeposit {
    return new KbisDeposit(this.fileValue, certification);
  }

  /**
   * Retire la parole sans toucher au fichier — un clic de trop doit pouvoir se
   * défaire, sinon personne n'osera cliquer.
   */
  revoke(): KbisDeposit {
    return new KbisDeposit(this.fileValue, null);
  }
}
