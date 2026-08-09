# Documentation LFC — index

**Cet index fait foi.** Un doc qui n'y figure pas est un doc que personne ne
retrouvera. On le met à jour dans le même commit que le doc qu'on ajoute.

Chaque ligne porte l'**état réel du code**, pas l'intention :

| Marque | Ce que ça veut dire                                         |
| ------ | ----------------------------------------------------------- |
| ✅     | Le doc décrit du code qui tourne.                           |
| 🟡     | Partiellement implémenté — le doc dit **où** est la limite. |
| 📐     | Doc-first : décidé, pas codé. Rien n'existe.                |

> Vérifié contre le code le **2026-08-09**. Les écarts trouvés ce jour-là sont
> consignés dans [`b2b/audit-flux-plateforme-admin.md`](b2b/audit-flux-plateforme-admin.md).

---

## Où va un nouveau doc

- Architecture / décision d'un projet → `b2b/`, `pim/`, `suite/`.
- TODO, roadmap, inventaire de dette → `todos/`.
- La **racine** ne porte que cet index et le **plan de release courant**.

---

## Plan courant

| Doc                                                  | État | De quoi ça parle                                                                                                               |
| ---------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`release-plan-2026-08.md`](release-plan-2026-08.md) | 🟡   | Les deux jalons d'août : plateforme client en test (12/08), commercial-acquisition (17/08). **Le plan qui pilote la semaine.** |

## B2B — la plateforme client et son back-office

| Doc                                                                                                    | État | De quoi ça parle                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------- |
| [`b2b/audit-flux-plateforme-admin.md`](b2b/audit-flux-plateforme-admin.md)                             | —    | **L'audit des flux plateforme → admin** : où la boucle ne se ferme pas. Point d'entrée avant tout arbitrage.    |
| [`b2b/architecture-identite-auth-tenancy.md`](b2b/architecture-identite-auth-tenancy.md)               | ✅   | Auth0, `Principal`, le mur `company_id`, personne ≠ société.                                                    |
| [`b2b/auth0-setup-b2b.md`](b2b/auth0-setup-b2b.md)                                                     | 🟡   | Réglage du tenant. **L'audience staff n'est pas provisionnée en prod.**                                         |
| [`b2b/architecture-onboarding-provisioning-b2b.md`](b2b/architecture-onboarding-provisioning-b2b.md)   | ✅   | Les deux portes (auto-inscription, commercial), le dossier `pending`.                                           |
| [`b2b/architecture-activation-configuration-b2b.md`](b2b/architecture-activation-configuration-b2b.md) | ✅   | Activation configurable pièce par pièce (`hidden`/`optional`/`required`).                                       |
| [`b2b/architecture-flux-commande-prod.md`](b2b/architecture-flux-commande-prod.md)                     | 🟡   | Le flux commande → production. **Cible** : les statuts après `placed` ne sont écrits nulle part.                |
| [`b2b/architecture-flux-commande-zero-friction.md`](b2b/architecture-flux-commande-zero-friction.md)   | ✅   | Commander sans entreprise ; acheminement en haut du panier.                                                     |
| [`b2b/architecture-conditionnements-pricing.md`](b2b/architecture-conditionnements-pricing.md)         | 📐   | Conditionnements et grilles tarifaires. Rien n'est codé.                                                        |
| [`b2b/architecture-road-livraison-tournees.md`](b2b/architecture-road-livraison-tournees.md)           | 📐   | Tournées de livraison. Rien n'est codé.                                                                         |
| [`b2b/architecture-prise-de-rendez-vous.md`](b2b/architecture-prise-de-rendez-vous.md)                 | 🟡   | Disponibilités, réservation, file staff, **types de demande**. R1→R7 codés ; **R6 notifications ne l'est pas**. |
| [`b2b/espace-commercial-prospects-leads.md`](b2b/espace-commercial-prospects-leads.md)                 | ✅   | Le concept : prospects froids/tièdes/chauds, pipeline du lead.                                                  |
| [`b2b/admin-commercial-comptes-clients.md`](b2b/admin-commercial-comptes-clients.md)                   | ✅   | La fiche société côté staff (activation, pièces, mutations).                                                    |
| [`b2b/commercial-data-analytics.md`](b2b/commercial-data-analytics.md)                                 | ✅   | Ce qu'on mesure et pourquoi.                                                                                    |
| [`b2b/audit-croissance-analytique.md`](b2b/audit-croissance-analytique.md)                             | ✅   | Audit des indicateurs de croissance.                                                                            |
| [`b2b/audit-catalogue-boutique-b2b.md`](b2b/audit-catalogue-boutique-b2b.md)                           | 🟡   | Le catalogue vu de la boutique. **Il est encore semé en dur des deux côtés.**                                   |
| [`b2b/release-acquisition-commerciale.md`](b2b/release-acquisition-commerciale.md)                     | 🟡   | Le cadre de la release commerciale (lots). Précédé par le plan courant.                                         |
| [`b2b/b2b_backend_deploy.md`](b2b/b2b_backend_deploy.md)                                               | 🟡   | Déploiement du backend (Cloudflare Containers). Scaffold non validé par un build Docker réel.                   |

## PIM — le référentiel produit

| Doc                                                                                                                                                                        | État | De quoi ça parle                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| [`pim/README.md`](pim/README.md)                                                                                                                                           | —    | Index interne du PIM (ADR, modèle de données, todo).              |
| [`pim/adr.md`](pim/adr.md)                                                                                                                                                 | ✅   | ADR-01→12 : les décisions structurantes.                          |
| [`pim/ledger.md`](pim/ledger.md)                                                                                                                                           | ✅   | Le journal de bord du projet.                                     |
| [`pim/todo.md`](pim/todo.md)                                                                                                                                               | 🟡   | Décisions ouvertes et reste-à-faire PIM.                          |
| [`pim/data-model/`](pim/data-model/)                                                                                                                                       | ✅   | Le modèle : produit, catalogue, nutrition, composition, SKU.      |
| [`pim/projection-shopify.md`](pim/projection-shopify.md) · [`pim/publication-reconciliation-3way.md`](pim/publication-reconciliation-3way.md) · [`pim/shopify-*.md`](pim/) | ✅   | La chaîne Shopify : projection, réconciliation 3 voies, API, e2e. |
| [`pim/projection-sales-context.md`](pim/projection-sales-context.md)                                                                                                       | 📐   | Contexte de vente.                                                |
| [`pim/migration-pim-localdb-vers-prisma.md`](pim/migration-pim-localdb-vers-prisma.md)                                                                                     | ✅   | La migration localDB → Prisma Postgres (faite).                   |

## Suite — le shell, la passerelle, l'exploitation

| Doc                                                                                          | État | De quoi ça parle                                              |
| -------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------- |
| [`suite/architecture-suite-gateway-scaling.md`](suite/architecture-suite-gateway-scaling.md) | 🟡   | Passerelle Cloudflare, sous-domaines, backends conteneurisés. |
| [`suite/architecture-ops-ecosystem-health.md`](suite/architecture-ops-ecosystem-health.md)   | 📐   | L'app OPS « Ecosystem Health ». Rien n'est codé.              |
| [`suite/CONTAINERIZE-NOTES.md`](suite/CONTAINERIZE-NOTES.md)                                 | 🟡   | Notes de conteneurisation.                                    |

## TODO et dette

| Doc                                                                            | État | De quoi ça parle                                                                                                           |
| ------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| [`todos/todo-commercial-acquisition.md`](todos/todo-commercial-acquisition.md) | 🟡   | Le TODO technique de l'espace commercial.                                                                                  |
| [`todos/todo-qualite-tests.md`](todos/todo-qualite-tests.md)                   | 🟡   | Ce que la CI **ne** couvre pas : specs non typecheckées, zéro ESLint dans les 4 apps Angular, tests Shopify live exclus.   |
| [`todos/todo-notifications.md`](todos/todo-notifications.md)                   | 🟡   | Le transport e-mail est branché ; **aucun e-mail ne part encore** — points d'appel, boîte de l'équipe, domaine à vérifier. |
| [`todos/todo-types-de-demande.md`](todos/todo-types-de-demande.md)             | 🟡   | Câblage de la taxonomie des demandes (contrat posé, persistance et UI à faire).                                            |

## Ailleurs dans le dépôt

- [`../CLAUDE.md`](../CLAUDE.md) — les conventions : architecture, qualité, commits, langue.
- `apps/*/CLAUDE.md` — les conventions **propres à une app** (elles priment localement).
- [`../apps/lfc-suite-shell/ARCHITECTURE.md`](../apps/lfc-suite-shell/ARCHITECTURE.md) — le shell hôte.
- [`../apps/lfc-B2B-platform-frontend/DEPLOYMENT-CLOUDFLARE.md`](../apps/lfc-B2B-platform-frontend/DEPLOYMENT-CLOUDFLARE.md) — déploiement du front client.
