import { InvalidRumError } from "../errors/mandate-errors.js";

/**
 * La borne de la **norme EPC**. Elle ne vaut qu'en **relecture** : c'est ce
 * qu'un fichier SEPA ou une ligne déjà en base ont le droit de porter.
 */
export const RUM_EPC_MAX_LENGTH = 35;

/**
 * 🔴 La borne **réelle à la frappe** — et elle vient du papier, pas de la norme.
 *
 * `core-mandate-pdf.ts` dessine la case de la référence en `comb(…, [26])` — le
 * mandat CORE ; l'interentreprises en a 35 depuis le 2026-09-15, la borne suit donc le
 * plus étroit des deux :
 * vingt-six cases, et `comb` remplit case par case en ignorant **silencieusement**
 * tout caractère au-delà de la dernière. Une RUM de 29 caractères sortirait donc
 * tronquée sur le papier signé pendant que la base en stocke 29 — l'écart ne se
 * verrait qu'en contestation, c'est-à-dire au pire moment.
 *
 * Élargir le peigne n'est pas une sortie : 29 cases dépassent le refend vertical
 * de l'en-tête et entrent dans la cellule du logo. La borne est imposée par la
 * mise en page du modèle EPC (vérifié le 2026-09-12).
 */
export const RUM_PRINTED_MAX_LENGTH = 26;

/**
 * Le préfixe de nos références. Aucune valeur technique : il sert à reconnaître
 * une de nos RUM quand un client la dicte au téléphone, ou quand elle apparaît
 * sur son relevé bancaire au milieu d'autres.
 */
export const RUM_PREFIX = "LFC";

/** Les symboles de la référence client repris dans la RUM. */
const CUSTOMER_CODE_LENGTH = 6;

/** Les symboles tirés du secret — l'unique part imprévisible de la référence. */
const DRAW_LENGTH = 6;

/**
 * Le jeu de caractères restreint SEPA, tel qu'il s'applique à une référence :
 * lettres non accentuées, chiffres, et une poignée de séparateurs.
 *
 * ⚠️ Ce n'est pas une coquetterie : un accent dans une référence fait rejeter le
 * **fichier entier** par la banque, pas la ligne.
 */
const SEPA_RESTRICTED = /^[A-Za-z0-9/\-?:().,'+ ]+$/u;

/** Ce qu'on garde d'une chaîne dont on ne veut que la substance. */
const NOT_ALPHANUMERIC = /[^A-Z0-9]/gu;

/**
 * L'horodateur de la frappe. **`Europe/Paris`, jamais le fuseau du serveur ni
 * UTC** : une RUM frappée à 00h30 à Paris tomberait la veille en UTC, et la
 * référence imprimée contredirait la date affichée à l'écran le même soir.
 */
const STAMP_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

/** Ce qu'il faut pour frapper une référence. */
export interface RumMintInput {
  /** La référence lisible de la société débitrice — `C-9P2X4B`. */
  readonly customerReference: string;
  /** L'instant de la **frappe**, lu à l'horloge. Voir le JSDoc de `mint`. */
  readonly at: Date;
  /** Un tirage frais du `SecretGenerator`. */
  readonly secret: string;
}

/**
 * **RUM** — la Référence Unique de Mandat, imprimée sur le papier signé.
 *
 * C'est ce que le débiteur oppose à sa banque, avec l'ICS, pour autoriser ou
 * bloquer un prélèvement. Elle est **frappée par le créancier** — nous — et c'est
 * précisément ce que la sortie de Stripe débloque : la référence venait d'eux et
 * n'existait qu'**après** l'enregistrement, donc un mandat prérempli ne pouvait
 * pas la porter. Sous notre propre ICS, elle existe avant l'impression.
 *
 * **C'est un identifiant, pas un secret** : imprimé, dicté au téléphone, lu sur
 * un relevé. Ce qu'on lui demande est d'être unique et non énumérable — pas
 * d'être confidentiel.
 *
 * Immuable : réécrire une RUM invaliderait le papier qui la porte.
 */
export class Rum {
  private constructor(readonly value: string) {}

  /**
   * Frappe une référence neuve — `LFC-9P2X4B-260912-K7M3QT`.
   *
   * ## La forme, et ce qu'elle coûte (décidé le 2026-09-12)
   *
   * Préfixe, **code du client**, **date de frappe**, **tirage**. Une première
   * version rendait 23 caractères opaques tirés du `SecretGenerator` — 115 bits,
   * aucune structure. Elle a été écartée pour une raison qui ne se voit qu'au
   * téléphone : un client appelle avec, pour seule information, la ligne de son
   * relevé bancaire. Une référence structurée dit tout de suite **qui** et
   * **quand** ; une référence opaque impose une recherche en base.
   *
   * ⚠️ **La fuite de métadonnées est assumée**, pas ignorée. Deux RUM comparées
   * révèlent l'ordre et l'écart des dates de frappe. C'est exactement ce qui
   * avait fait écarter une dérivation par ULID — mais là, l'horodatage ne
   * s'achetait rien, alors qu'ici il paie la lisibilité au support. Et son
   * audience est nulle en pratique : un client ne voit jamais que sa propre RUM.
   *
   * ## 🔴 `at` est la date de FRAPPE, jamais celle de la signature
   *
   * La RUM existe avant l'impression ; le client signe et renvoie le scan des
   * jours plus tard. Les deux dates diffèrent toujours, et c'est la date de
   * signature, pas celle-ci, qui alimente le `DtOfSgntr` d'un `pain.008`. Lire
   * cette estampille comme une date de consentement serait une erreur de fond.
   *
   * ## Pourquoi reprendre la référence client ne l'affaiblit pas
   *
   * `Company.reference` n'est **pas un compteur** : `platform/id/reference.ts`
   * la dérive de la **queue** d'un ULID — 30 bits d'aléa dans un alphabet sans
   * caractères ambigus (vérifié le 2026-09-12). Elle ne révèle donc ni notre
   * nombre de clients ni leur ordre d'arrivée, et la RUM reste hors de portée
   * d'une énumération : 30 bits du code plus 30 du tirage.
   *
   * Si cette référence devenait un jour séquentielle, cette phrase serait fausse
   * et la forme serait à revoir — c'est la seule hypothèse que `mint` fait sur
   * un autre contexte.
   *
   * @throws {InvalidRumError} référence client vide, instant invalide, ou
   *   tirage trop court pour fournir ses symboles.
   */
  static mint({ customerReference, at, secret }: RumMintInput): Rum {
    const code = substanceOf(customerReference).slice(-CUSTOMER_CODE_LENGTH);
    if (code === "") {
      throw new InvalidRumError(
        customerReference,
        "référence client sans aucun symbole utilisable",
      );
    }

    if (Number.isNaN(at.getTime())) {
      throw new InvalidRumError(customerReference, "instant de frappe invalide");
    }

    const draw = substanceOf(secret).slice(0, DRAW_LENGTH);
    if (draw.length < DRAW_LENGTH) {
      throw new InvalidRumError(
        customerReference,
        `tirage trop court : ${String(DRAW_LENGTH)} symboles attendus, ${String(draw.length)} disponibles`,
      );
    }

    // La frappe se valide contre la borne du PAPIER, pas contre celle de la
    // norme : c'est le peigne qui tronquerait, et il le ferait en silence.
    return Rum.parse(`${RUM_PREFIX}-${code}-${stampOf(at)}-${draw}`, RUM_PRINTED_MAX_LENGTH);
  }

  /**
   * Relit une référence existante — base, import, fichier de retour.
   *
   * ⚠️ Volontairement **plus permissif que `mint`** : jusqu'à 35 caractères. Une
   * référence déjà en base n'a pas forcément été frappée ici — l'ère Stripe en a
   * posé, et une reprise de portefeuille en posera d'autres. Resserrer la
   * relecture sur 26 ferait échouer la **rehydratation** d'un mandat parfaitement
   * valide, c'est-à-dire refuser un fait accompli au nom d'une règle qui ne
   * s'applique qu'à ce qu'on écrit.
   */
  static create(raw: string): Rum {
    return Rum.parse(raw, RUM_EPC_MAX_LENGTH);
  }

  /**
   * Le seul point de validation — deux bornes, une seule règle.
   *
   * Membre de la classe et non fonction de module : elle est la **seule** à
   * appeler le constructeur privé, ce qui est exactement la garantie qu'aucune
   * `Rum` n'existe sans être passée par ces trois refus.
   */
  private static parse(raw: string, maxLength: number): Rum {
    const trimmed = raw.trim();

    if (trimmed === "") {
      throw new InvalidRumError(raw, "vide");
    }
    if (trimmed.length > maxLength) {
      throw new InvalidRumError(
        raw,
        `${String(maxLength)} caractères au maximum, ${String(trimmed.length)} reçus`,
      );
    }
    if (!SEPA_RESTRICTED.test(trimmed)) {
      throw new InvalidRumError(raw, "caractère hors du jeu SEPA (ni accent, ni symbole exotique)");
    }

    return new Rum(trimmed);
  }

  toString(): string {
    return this.value;
  }
}

/** Majuscules, et rien que des lettres et des chiffres. */
function substanceOf(raw: string): string {
  return raw.toUpperCase().replace(NOT_ALPHANUMERIC, "");
}

/** `YYMMDD` à Paris. */
function stampOf(at: Date): string {
  const parts = STAMP_FORMAT.formatToParts(at);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("year")}${valueOf("month")}${valueOf("day")}`;
}
