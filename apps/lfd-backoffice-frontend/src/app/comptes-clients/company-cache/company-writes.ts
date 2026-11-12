import { Injectable, signal } from '@angular/core';

/**
 * **Le compteur des écritures du back-office**, que les magasins de sociétés
 * comparent à celui de leur dernière lecture.
 *
 * Il ne sait rien des sociétés : il monte d'un cran à chaque écriture vers
 * l'API B2B (cf. `companyWritesInterceptor`). Un magasin qui a lu au cran 3 et
 * qu'on interroge au cran 4 relit. C'est volontairement large — une écriture
 * qui ne touche aucune société fait relire pour rien la prochaine fois —, parce
 * que l'inverse, une écriture oubliée dans une liste de routes, montrerait un
 * état périmé juste après un geste, et c'est le défaut qu'on ne pardonne pas.
 *
 * Sans dépendance, pour que l'intercepteur puisse l'injecter sans boucle :
 * `HttpClient` → intercepteur → magasin → service → `HttpClient`.
 */
@Injectable({ providedIn: 'root' })
export class CompanyWrites {
  private readonly counter = signal(0);

  /** Le cran courant. */
  readonly version = this.counter.asReadonly();

  /** Une écriture vient d'aboutir (ou d'échouer : elle a pu écrire en partie). */
  record(): void {
    this.counter.update((value) => value + 1);
  }
}
