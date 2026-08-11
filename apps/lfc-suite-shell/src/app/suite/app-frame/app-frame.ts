import { DOCUMENT, Location } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  type OnInit,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DomSanitizer } from "@angular/platform-browser";
import type { SafeResourceUrl } from "@angular/platform-browser";
import { NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";
import { FoldButtonComponent, FoldSpinnerComponent } from "fold-ng";

import { appUrlFor } from "../suite-app";
import { SuiteBridge } from "../suite-bridge";

type FrameStatus = "probing" | "ready" | "error";

/**
 * Cadre d'une app hostée : une `<iframe>` plein content vers l'app, **durcie** :
 * - **reachability** avant montage (`fetch(no-cors)`), car un échec de chargement
 *   cross-origin n'est pas détectable dans l'iframe → sinon on n'aurait que le
 *   « refused » brut du navigateur ;
 * - **état d'erreur + bouton Recharger** si l'app est injoignable ;
 * - **deep-link** : le sous-chemin de l'URL parent (`/pim/produits`) est passé à
 *   l'app dans l'`src` (donc refresh & lien direct marchent) ;
 * - **back/forward** : sur nav du parent, on demande à l'app de naviguer via le
 *   bridge (postMessage), SANS recharger l'iframe.
 *
 * `appId`/`routePath`/`appTitle` sont liés depuis les `data` de la route.
 */
@Component({
  selector: "app-app-frame",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldSpinnerComponent],
  templateUrl: "./app-frame.html",
  styleUrl: "./app-frame.scss",
})
export class AppFrame implements OnInit {
  readonly appId = input.required<string>();
  readonly routePath = input.required<string>();
  readonly appTitle = input<string>("");

  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly bridge = inject(SuiteBridge);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<FrameStatus>("probing");
  /** Incrémenté par « Recharger » → force une nouvelle URL d'iframe. */
  private readonly reloadNonce = signal(0);
  /** Génération de sonde : une nouvelle sonde invalide la précédente (annule ses retries). */
  private probeGeneration = 0;
  /** Combien de tentatives, et l'attente entre chacune — laisse au dev-server hôte le
   *  temps de finir son (re)build sans que l'utilisateur ait à faire F5. */
  private static readonly PROBE_ATTEMPTS = 6;
  private static readonly PROBE_DELAY_MS = 500;
  /** Sous-chemin figé au montage (deep-link) ; fixé en `ngOnInit` (les inputs
   *  requis ne sont pas disponibles dans un initialiseur de champ). */
  private initialPath = "";

  protected readonly baseUrl = computed(() => appUrlFor(this.appId()));

  protected readonly safeSrc = computed<SafeResourceUrl | null>(() => {
    const base = this.baseUrl();
    if (base === undefined || this.status() !== "ready") {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.buildUrl(base));
  });

  constructor() {
    // (Re)sonde à chaque changement d'app ou de nonce de reload.
    effect(() => {
      this.appId();
      this.reloadNonce();
      void this.probe();
    });

    // Nav du parent (back/forward) → demander à l'app de naviguer, sans reload.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.bridge.notifyNavigate(this.appId(), this.currentSubPath()));
  }

  ngOnInit(): void {
    // Les inputs (data de route) sont disponibles ici, pas à la construction.
    this.initialPath = this.currentSubPath();
  }

  protected reload(): void {
    this.reloadNonce.update((n) => n + 1);
  }

  /**
   * Vérifie que le serveur de l'app répond (opaque = up ; rejet = injoignable).
   * Réessaie quelques fois avant d'abandonner : au (re)chargement de la suite,
   * le dev-server de l'app peut finir son build une fraction de seconde plus tard.
   * Une sonde plus récente (changement d'app / Recharger) invalide celle-ci.
   */
  private async probe(): Promise<void> {
    const generation = ++this.probeGeneration;
    const base = this.baseUrl();
    if (base === undefined) {
      this.status.set("error");
      return;
    }
    this.status.set("probing");
    for (let attempt = 1; attempt <= AppFrame.PROBE_ATTEMPTS; attempt++) {
      if (generation !== this.probeGeneration) {
        return;
      }
      try {
        await fetch(base, { mode: "no-cors", cache: "no-store" });
        this.status.set("ready");
        return;
      } catch {
        if (attempt < AppFrame.PROBE_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, AppFrame.PROBE_DELAY_MS));
        }
      }
    }
    if (generation === this.probeGeneration) {
      this.status.set("error");
    }
  }

  /** URL de l'iframe : base + sous-chemin (deep-link) + origine du shell (handshake). */
  private buildUrl(base: string): string {
    const host = this.document.defaultView?.location.origin ?? "";
    const path = this.initialPath ? `/${this.initialPath}` : "";
    const params = new URLSearchParams({ suiteHost: host });
    return `${base}${path}?${params.toString()}`;
  }

  /** Sous-chemin de l'URL parent, relatif au `routePath` de l'app. */
  private currentSubPath(): string {
    const full = this.location.path().split("?")[0] ?? "";
    const prefix = `/${this.routePath()}`;
    if (!full.startsWith(prefix)) {
      return "";
    }
    return full.slice(prefix.length).replace(/^\/+/, "");
  }
}
