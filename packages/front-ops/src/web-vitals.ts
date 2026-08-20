import { provideEnvironmentInitializer } from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";
import { onCLS, onINP, onLCP, type Metric } from "web-vitals";
import { isWebVitalName, type WebVitalSample } from "@lfd/ops-contract";

/**
 * **Ce que les vraies personnes vivent**, renvoyé à notre API.
 *
 * C'est le témoin qui manquait : une sonde dit qu'un front est *servi*, jamais
 * qu'il *démarre*, encore moins qu'il est agréable. Ces trois mesures viennent
 * du navigateur de quelqu'un — la seule source qui parle de l'expérience réelle
 * plutôt que de ce que Cloudflare a bien voulu rendre.
 *
 * ## Ce qu'on n'envoie pas, et c'est délibéré
 *
 * Ni identifiant, ni adresse, **ni le chemin visité** — il trahirait la page
 * qu'une personne est en train de regarder, et il n'est pas nécessaire pour
 * savoir si le front est lent. Trois nombres et le nom du front, rien d'autre.
 *
 * ## Une seule requête, au moment où la page part
 *
 * Les mesures s'accumulent puis partent en **un** envoi, quand l'onglet passe
 * en arrière-plan. Trois requêtes par visite feraient trois fois le travail
 * pour la même information — et sur la boutique, c'est le genre de détail qui
 * finit en ligne de facture.
 *
 * `sendBeacon` plutôt que `fetch` : il survit à la fermeture de l'onglet, là où
 * une requête classique est annulée. Un envoi au `beforeunload` qui n'arrive
 * jamais, c'est une mesure qu'on croit avoir.
 */
export function provideWebVitals(front: string, apiBaseUrl: string): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    // SSR et environnements sans navigateur : il n'y a rien à mesurer, et
    // `navigator` n'existe pas.
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    startReporting(front, `${apiBaseUrl}/ops/vitals`);
  });
}

function startReporting(front: string, endpoint: string): void {
  const pending: WebVitalSample[] = [];
  const collect = (metric: Metric): void => {
    // `web-vitals` rend cinq mesures ; notre contrat en connaît trois. On
    // vérifie plutôt qu'on affirme : le jour où la bibliothèque en ajoute une,
    // elle est ignorée au lieu d'atterrir en base sous un nom inconnu.
    if (isWebVitalName(metric.name)) {
      pending.push({ front, metric: metric.name, value: metric.value });
    }
  };

  onLCP(collect);
  onINP(collect);
  onCLS(collect);

  const flush = (): void => {
    if (pending.length === 0) {
      return;
    }
    const body = JSON.stringify({ samples: pending.splice(0) });
    // Le type MIME compte : sans `application/json`, le beacon part en
    // `text/plain` et l'API le reçoit non analysé — donc vide, silencieusement.
    navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
  };

  // `visibilitychange` et non `unload` : sur mobile, une page mise en arrière-plan
  // peut ne jamais recevoir d'événement de déchargement. C'est le seul moment
  // fiable pour dire au revoir.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  });
  window.addEventListener("pagehide", flush);
}
