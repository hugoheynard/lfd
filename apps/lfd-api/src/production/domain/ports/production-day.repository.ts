import type { DoneMark, PackedLineMark, ProductionDay } from "../entities/production-day.js";
import type { ContainerStep } from "../value-objects/container-step.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le port d'écriture de la journée** — il prend et rend l'AGRÉGAT.
 *
 * Pas de `markClosed(date)`, pas de `saveCounts(...)` : une méthode qui écrirait
 * une colonne à partir de primitives ferait sortir l'invariant de l'agrégat pour
 * le poser dans le handler, où le prochain appelant ne le verrait pas. C'est le
 * smell « transaction script » que le `CLAUDE.md` décrit, et la raison pour
 * laquelle ce port n'a que deux méthodes.
 *
 * ⚠️ `load` rend une journée **OUVERTE** quand rien n'est écrit, jamais `null` :
 * une journée qu'on n'a pas encore arrêtée existe — elle est simplement vide. Un
 * `null` obligerait chaque appelant à décider ce qu'il en fait, et l'un d'eux
 * finirait par créer la journée d'une manière que l'agrégat n'a pas prévue.
 */
export abstract class ProductionDayRepository {
  abstract load(day: ServiceDay): Promise<ProductionDay>;

  /**
   * Écrit l'agrégat en entier, commandes et compte compris.
   *
   * L'écriture est **atomique** : un compte à produire enregistré sans ses
   * commandes décrirait une journée que personne ne pourrait relire.
   */
  abstract save(day: ProductionDay): Promise<void>;

  /**
   * Grave le **colisage** d'une commande. Écriture nue, et conditionnée en base.
   *
   * ⚠️ **Ce n'est pas une entorse au §3.1, c'est le cas qu'il autorise.** Une
   * `load` → `pack()` → `save` réécrirait la journée entière, donc deux postes
   * qui scannent la même feuille au même moment se perdraient l'un l'autre — et
   * deux mains sur la même commande est le cas NORMAL au fournil, pas une
   * anomalie. La condition `packed_at IS NULL` fait arbitrer la BASE.
   *
   * La règle métier, elle, reste dans l'agrégat : `pack()` refuse une journée
   * ouverte, une référence inconnue, un bac déjà fait. Elle est évaluée sur
   * l'état lu ; cette écriture ne tranche que la course. C'est exactement le
   * partage de `markHandedOver` côté commerce.
   *
   * Rend `false` quand la course est perdue.
   */
  abstract markPacked(day: ServiceDay, reference: string, at: Date, by: string): Promise<boolean>;

  /**
   * Coche (`mark`) ou décoche (`null`) une ligne du **compte à produire**.
   *
   * Écriture ciblée pour la même raison que {@link markPacked} — `save` réécrit
   * la journée entière, et six postes cochent six fiches en même temps — mais
   * **sans condition en base** : une case se décoche et se recoche, donc le
   * dernier geste est le vrai et il n'y a pas de course à arbitrer.
   *
   * Les deux refus (journée ouverte, SKU hors compte) restent dans l'agrégat,
   * `itemToMark`. Ce port n'écrit que ce qu'il a déjà laissé passer.
   */
  abstract markProduced(day: ServiceDay, sku: string, mark: DoneMark | null): Promise<void>;

  /**
   * Met une ligne **au bac** (`mark`) ou l'en ressort (`null`).
   *
   * Écriture ciblée pour la raison de {@link markProduced}, aggravée d'un cran :
   * deux postes colisent DEUX BACS DIFFÉRENTS en même temps, et c'est le cas
   * normal du poste de colisage — chacun tient un bon. Un `save` de l'agrégat
   * réécrit la journée entière (il efface commandes et lignes avant de les
   * recréer) ; le second écrasement effacerait tout le remplissage du premier,
   * et le fournil relirait un bac qu'il vient de finir comme s'il était vide.
   *
   * Sans condition en base, là encore : une case se décoche et se recoche, donc
   * le dernier geste est le vrai et il n'y a pas de course à arbitrer.
   *
   * Les quatre refus (journée ouverte, référence hors plan, SKU hors bon, bac
   * fermé) restent dans l'agrégat, `lineToPack`. Ce port n'écrit que ce qu'il a
   * déjà laissé passer.
   */
  abstract markPackedLine(
    day: ServiceDay,
    reference: string,
    sku: string,
    mark: PackedLineMark | null,
  ): Promise<void>;

  /**
   * Grave le **nombre de containers** qu'une commande occupe.
   *
   * Écriture ciblée pour la raison de {@link markPackedLine}, et c'est la même
   * scène : deux postes tiennent deux bons au même moment, et un `save` de
   * l'agrégat réécrirait la journée entière — le second écrasement effacerait le
   * remplissage et le compte du premier.
   *
   * Sans condition en base : un compte se corrige tant que le bac est ouvert,
   * donc le dernier geste est le vrai. Les quatre refus (journée ouverte,
   * référence hors plan, bac fermé, nombre invalide) restent dans l'agrégat,
   * `declareContainers`.
   */
  abstract recordContainerCount(
    day: ServiceDay,
    reference: string,
    containers: number,
  ): Promise<void>;

  /**
   * **Un container de plus, ou de moins** — calculé PAR LA BASE.
   *
   * ⚠️ C'est l'écriture nue la plus justifiée de ce port. Un total envoyé par
   * l'écran perdait un container quand deux postes appuyaient ensemble ; un
   * `load` → calcul → écriture côté serveur rouvrirait exactement la même
   * course, puisque les deux lectures verraient le même compte. Seul
   * `container_count = container_count ± 1` compose deux gestes simultanés.
   *
   * Les bornes et `packed_at IS NULL` sont dans le `WHERE` : un pas qui les
   * franchirait ne s'écrit pas. Rend `false` quand rien n'a été écrit — au
   * plafond, à zéro, bac fermé entre-temps. C'est l'appelant qui dit pourquoi,
   * en relisant l'agrégat.
   */
  abstract stepContainerCount(
    day: ServiceDay,
    reference: string,
    step: ContainerStep,
  ): Promise<boolean>;
}
