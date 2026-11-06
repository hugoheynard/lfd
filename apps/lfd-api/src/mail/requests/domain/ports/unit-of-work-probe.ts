/**
 * Port de **lecture** : une unité de travail est-elle ouverte ici ?
 *
 * Ce que `send` exige (la demande part avec la transaction de l'appelant)
 * et ce que `sendAndAwaitReceipt` refuse (un envoi pour une écriture encore annulable).
 */
export abstract class UnitOfWorkProbe {
  abstract isOpen(): boolean;
}
