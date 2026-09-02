/**
 * **Qu'est-ce qui attend d'être validé, et qu'est-ce que ça changerait ?**
 *
 * Une seule question, parce qu'il n'y a qu'une arrivée possible : l'unicité est
 * tenue par un index partiel de Postgres, et rendre une liste laisserait croire
 * le contraire à chaque appelant.
 */
export class GetPendingDeliveryQuery {}
