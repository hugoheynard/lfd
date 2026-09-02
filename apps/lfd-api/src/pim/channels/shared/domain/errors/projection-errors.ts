import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Refus **métier** : le catalogue a bougé entre la relecture et l'envoi.
 *
 * C'est l'unique raison d'être de l'empreinte de projection. Sans elle, le
 * `dryRun` qu'on regarde et le push qui suit sont deux appels séparés que rien
 * ne rattache : on relit un catalogue, on en envoie un autre, et personne ne le
 * sait. Sur quatre-vingt-quinze articles ça ne se voit pas — c'est précisément
 * pour ça qu'il faut le refuser avant que ça se voie.
 *
 * **409, pas 400** : la requête est bien formée, c'est l'état du monde qui a
 * changé. Un `400` dirait à l'appelant qu'il s'est trompé, alors qu'il a
 * raison de réessayer — après avoir relu.
 *
 * ⚠️ Le message nomme le geste de sortie, pas la cause technique : il est lu
 * par du personnel qui n'a pas le code sous les yeux.
 */
export class ProjectionDriftError extends BusinessError {
  constructor(
    readonly channel: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      "channels.projection.drift",
      "Le catalogue a changé depuis votre relecture : rien n'a été envoyé. " +
        "Rechargez l'aperçu pour voir ce qui a bougé, puis poussez à nouveau.",
    );
  }
}
