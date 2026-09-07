/**
 * **Une journée de fabrication vient d'être arrêtée.**
 *
 * Le fait appartient à la production : c'est elle qui décide qu'une journée
 * bascule. Le commerce l'apprend et en tire ses conséquences — ses commandes
 * passent `confirmed` — sans que la production ait à le savoir. C'est le
 * couplage minimal : chaque contexte n'écrit QUE ses propres tables.
 *
 * ⚠️ **Il est publié aussi lors d'une RÉANNONCE.** Presser à nouveau le bouton
 * sur une journée déjà arrêtée ne recalcule rien — l'agrégat refuse — mais
 * republie le fait. C'est le rattrapage prévu quand un abonné a échoué : le bus
 * vit en processus, l'événement n'est ni persisté ni rejoué, et un container qui
 * tombe entre la publication et l'écriture laisserait des commandes `placed` sur
 * une journée close.
 *
 * Les abonnés doivent donc être **idempotents**. `absorbIntoPlan` l'est par son
 * `where` (`status: placed`), et c'est ce qui rend la réannonce sans danger.
 *
 * 🔴 **Il vit dans le CANAL, pas dans le domaine**, et la porte des frontières
 * me l'a appris : un événement qu'un autre bloc consomme fait partie de la
 * surface publiée, au même titre qu'un port. Le laisser dans `domain/events/`
 * aurait obligé le commerce à atteindre l'intérieur du fournil pour s'abonner —
 * « on n'atteint pas l'intérieur d'un autre bloc parce qu'on en connaît le
 * chemin ».
 */
export class ProductionDayClosedEvent {
  constructor(
    /** `AAAA-MM-JJ` — la journée arrêtée. */
    readonly serviceDay: string,
    /** L'instant de la clôture **d'origine**, jamais celui du rejeu. */
    readonly closedAt: Date,
    /** Ce que la production a inscrit chez elle. Pour le journal, pas pour agir. */
    readonly orderCount: number,
  ) {}
}
