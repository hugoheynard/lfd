/**
 * Port de **lecture** : une unité de travail est-elle ouverte ici ?
 *
 * Ce que `request` exige (la demande part avec la transaction de l'appelant)
 * et ce que `sendNow` refuse (un envoi pour une écriture encore annulable).
 */
export abstract class UnitOfWorkProbe {
  abstract isOpen(): boolean;
}
