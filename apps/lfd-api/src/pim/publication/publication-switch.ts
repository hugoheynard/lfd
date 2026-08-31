import { Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CanActivate, ExecutionContext } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import { BusinessError } from "../../platform/shared/errors/app-error.js";

/** Le geste refusé, nommé — l'écran doit pouvoir dire lequel. */
export class PublicationClosedError extends BusinessError {
  constructor() {
    super(
      "catalogue.publication.closed",
      "La publication du catalogue est fermée sur ce déploiement. " +
        "Les fiches se saisissent, se signent et se mettent en vente normalement ; " +
        "rien ne part vers une boutique ni vers la plateforme professionnelle.",
    );
  }
}

const PUBLICATION_GESTURE = "pim:publication-gesture";

/**
 * Marque une route comme **geste de publication** — ce qui envoie le catalogue
 * dehors, ou pose l'ancre qui le précède.
 *
 * Un marqueur plutôt qu'un `if` dans chaque handler : la liste de ce qui publie
 * se lit alors en parcourant les contrôleurs, et le jour où le drapeau
 * disparaîtra, il suffira de retirer les décorateurs. Un `if` disséminé aurait
 * demandé de retrouver chaque endroit — et d'en oublier un.
 */
export const PublicationGesture = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLICATION_GESTURE, true);

/**
 * Ferme les gestes marqués quand la publication n'est pas ouverte.
 *
 * ⚠️ Ce n'est **pas** une autorisation : ça ne dit rien de la personne, tout du
 * déploiement. D'où un refus métier (`409`) et non un `403` — qui ferait
 * chercher un droit manquant là où il n'y en a pas.
 *
 * Le mur est ICI et non dans l'écran. Le front cache les boutons, le serveur
 * refuse les appels ; sans le second, une requête recopiée depuis l'onglet
 * réseau publierait quand même.
 */
@Injectable()
export class PublicationEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const marked = this.reflector.getAllAndOverride<boolean>(PUBLICATION_GESTURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (marked !== true || this.config.publicationEnabled()) {
      return true;
    }
    throw new PublicationClosedError();
  }
}
