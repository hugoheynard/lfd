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
 *
 * ## 🔴 Ce qu'il ne promet PLUS, et pourquoi
 *
 * Il disait « rechargez l'aperçu **pour voir ce qui a bougé** ». C'était une
 * promesse que rien ne pouvait tenir, et elle se retournait contre la garde.
 *
 * L'empreinte couvre **toute** la projection — chaque champ de chaque
 * déclinaison et de chaque famille, `position` et `weightGrams` compris.
 * L'aperçu, lui, n'affiche que le nombre de candidats, les compteurs du rapport
 * et les SKU écartés avec leur motif : **aucun contenu**. Un prix corrigé par un
 * collègue pendant qu'on pousse ne change donc aucun de ces chiffres. On
 * re-simule, on voit la carte identique, on renvoie, ça passe.
 *
 * Le coût n'est pas le message : c'est le RÉFLEXE qu'il enseigne. « Re-simuler
 * et renvoyer » est précisément le geste qui vide cette garde de son sens — on
 * ne relit rien, on rafraîchit un jeton.
 *
 * Le message dit donc ce qui est vrai, et le geste que le front impose déjà :
 * re-simuler. Il ne prétend plus diagnostiquer.
 *
 * ⚠️ **La suite possible, et le piège qui la guette.** Nommer les SKU qui ont
 * bougé demanderait de comparer la projection relue à la projection courante,
 * donc de garder la première. Comparer les deux **ancres** à la place serait
 * plus simple et **faux** : une ancre hache `RevisionItemInput`, pas la
 * projection. Un libellé d'allergène reprojeté change la projection sans
 * toucher l'ancre, et une `nutrition` corrigée fait l'inverse. Un diff d'ancres
 * répondrait donc parfois « rien n'a changé » à un refus de dérive — une
 * seconde promesse fausse, à la place de celle qu'on vient de retirer.
 */
export class ProjectionDriftError extends BusinessError {
  constructor(
    readonly channel: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      "channels.projection.drift",
      "Le catalogue a changé depuis votre simulation : rien n'a été envoyé. " +
        "Simulez à nouveau — vous enverrez alors l'état actuel, pas celui que " +
        "vous aviez relu.",
    );
  }
}
