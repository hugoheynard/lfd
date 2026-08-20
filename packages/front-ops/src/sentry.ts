import { ErrorHandler, provideAppInitializer } from "@angular/core";
import type { EnvironmentProviders, Provider } from "@angular/core";
// Import de TYPE seul : il s'efface à la compilation, donc il ne remet pas le
// SDK dans le bundle initial — c'est ce qui permet de typer sans importer.
import type { ErrorEvent as SentryErrorEvent } from "@sentry/angular";

/**
 * **Ce qui casse dans le navigateur d'un client**, et qu'on n'apprenait jamais.
 *
 * Une erreur front ne laisse aucune trace chez nous : ni `5xx`, ni ligne de
 * journal, rien que la passerelle puisse voir. Elle produit une page blanche et
 * quelqu'un qui s'en va. C'est le seul angle mort que rien de ce qu'on a
 * construit ne couvre.
 *
 * ## Pourquoi un tiers ici, alors qu'on garde le reste chez nous
 *
 * Les *source maps*. Une pile Angular minifiée dit `t.n is not a function` dans
 * `chunk-A1B2.js:1:48210`. La rendre lisible suppose de stocker les source maps
 * par build et d'écrire un symbolicateur — pas un week-end, et le code le moins
 * réutilisable qu'on écrirait jamais.
 *
 * ## 🔴 Chargé À LA DEMANDE, et c'est non négociable
 *
 * Le SDK pèse ~110 ko et faisait dépasser le budget de bundle de cette app.
 * Autrement dit : l'outil qu'on ajoute pour mesurer le LCP l'aurait dégradé,
 * pour tout le monde, y compris ceux chez qui rien ne casse. Un outil
 * d'observation qui abîme ce qu'il observe ne vaut pas d'être installé.
 *
 * Il part donc dans son propre morceau, chargé **après** le démarrage — et
 * jamais téléchargé quand il n'y a pas de DSN, ce qui est le cas en
 * développement.
 *
 * Les erreurs levées avant son arrivée ne sont pas perdues : elles attendent en
 * file et sont rejouées. Ce sont justement les plus intéressantes — un runtime
 * qui explose au démarrage est exactement ce que `deploy-ok` ne sait pas voir.
 */

/** Combien d'erreurs on garde en attendant le SDK. Au-delà, la première casse suffit. */
const QUEUE_LIMIT = 10;

/**
 * Le gestionnaire d'erreurs, avant et après l'arrivée du SDK.
 *
 * Il ne dépend pas de Sentry : c'est ce qui permet de le fournir sans tirer le
 * paquet dans le bundle initial.
 */
class DeferredErrorHandler implements ErrorHandler {
  private delegate: ErrorHandler | null = null;
  private readonly waiting: unknown[] = [];

  handleError(error: unknown): void {
    // La console reste servie dans TOUS les cas : un développeur ne doit jamais
    // avoir à ouvrir un tableau de bord distant pour voir une pile locale.
    console.error(error);
    if (this.delegate !== null) {
      this.delegate.handleError(error);
      return;
    }
    if (this.waiting.length < QUEUE_LIMIT) {
      this.waiting.push(error);
    }
  }

  adopt(delegate: ErrorHandler): void {
    this.delegate = delegate;
    for (const error of this.waiting.splice(0)) {
      delegate.handleError(error);
    }
  }
}

export function provideSentry(
  dsn: string,
  release: string,
): readonly (Provider | EnvironmentProviders)[] {
  if (dsn === "") {
    return [];
  }
  const handler = new DeferredErrorHandler();
  return [
    { provide: ErrorHandler, useValue: handler },
    provideAppInitializer(() => {
      // PAS d'`await` : attendre le SDK retarderait le premier rendu de tout le
      // monde pour une fonction dont personne n'a besoin dans les 200 premières
      // millisecondes.
      void load(dsn, release, handler);
    }),
  ];
}

async function load(dsn: string, release: string, handler: DeferredErrorHandler): Promise<void> {
  const Sentry = await import("@sentry/angular");
  Sentry.init({
    dsn,
    release,
    // Une part seulement des traces : le forfait gratuit compte les spans, et
    // une boutique n'a pas besoin d'être tracée intégralement pour dire si elle
    // est lente.
    tracesSampleRate: 0.05,
    // Le SDK ne les envoie pas par défaut ; on l'écrit quand même, parce qu'un
    // défaut se retourne au fil des versions et que ce qui est parti est parti.
    sendDefaultPii: false,
    beforeSend: strip,
  });
  handler.adopt(Sentry.createErrorHandler());
}

/**
 * Retire ce qui pourrait porter une personne : en-têtes, cookies, corps de
 * requête. On garde le **type** d'erreur, la pile et l'URL — de quoi corriger,
 * rien pour identifier.
 */
function strip(event: SentryErrorEvent): SentryErrorEvent {
  // On reconstruit à partir d'une COPIE plutôt que de déstructurer pour écarter :
  // un `user: _user` inutilisé se lit comme un oubli, alors que ces deux
  // suppressions sont le cœur de la fonction.
  const cleaned: SentryErrorEvent = { ...event };
  const url = cleaned.request?.url;
  delete cleaned.user;
  delete cleaned.request;
  return url === undefined ? cleaned : { ...cleaned, request: { url } };
}
