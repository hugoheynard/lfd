# Plan — la fidélité passe en Gestion Boutique, sous `lfc_loyalty`

> 📐 **Doc-first, rien n'est bâti** (rédigé le 2026-10-16). Déplace un
> **périmètre de permissions** : `vitruve` d'office (CLAUDE.md §9 bis). Sa
> contradiction, en fin de document, prime sur F1–F4.
>
> ✅ **F1 bâti le 2026-10-16** (non commité à l'écriture de ce bandeau) :
> migration `20261016230000_le_droit_de_la_fidelite` (enum seul, aucun droit),
> `lfc_loyalty` dans `staff-access.ts` (schéma, libellé « Fidélité », graine
> `write` à l'administrateur seul) et `staff-resource-scopes.ts`. Les gardes
> restent sur `b2b_accounting`. Reste : le geste de Hugo à l'écran, puis F2.

## 0. La demande (Hugo, 2026-10-16)

> « Déplace fidélité dans Gestion Boutique, avec les routes `/fidelite`, un
> droit dédié `lfc_` — je ne sais plus quel mot anglais on a mis. »

Le mot est `loyalty` (le contexte serveur est `src/b2b/loyalty/`).

## 1. Ce qui existe (ouvert le 2026-10-16)

- **Écran** : `/comptabilite/fidelite` (`comptabilite/comptabilite.routes.ts:98-106`),
  composant `comptabilite/fidelite/` (réglage, soldes, bons, ajuster, annuler
  un bon). Il hérite de la garde de la coquille comptabilité
  (`b2b_accounting:read`, l. 20) ; ses gestes demandent `b2b_accounting:write`.
- **Rail** : l'entrée `fidelite` (`shared/workspace-rail/workspaces.ts:801-806`),
  sous `b2b_accounting:read`, dans l'espace Comptabilité.
- **Serveur** : `admin/accounting/loyalty`
  (`b2b/loyalty/http/admin-loyalty.controller.ts:31-32`), `@AdminSurface("b2b_accounting")`.
  Les deux autres contrôleurs du contexte (`my-loyalty`, `loyalty-sweep`)
  ne sont pas des surfaces staff.
- **Le précédent** : `lfc_catalog` (même jour) et `lfc_operations`, ajoutés
  par un `ALTER TYPE … ADD VALUE` seul, sans droit accordé ; la ressource
  s'accorde à l'écran.

## 2. Décisions proposées

- **F1 — `lfc_loyalty`**, ressource neuve (migration seule, aucun droit
  accordé), libellé « Fidélité », portées : lire le programme, les soldes et
  les bons ; écrire = régler le programme, ajuster un solde, annuler un bon.
- **F2 — l'écran** quitte la coquille comptabilité : `/fidelite`, entrée du
  rail dans Gestion Boutique, garde `lfc_loyalty:read` ; gestes sous
  `lfc_loyalty:write`. `/comptabilite/fidelite` redirige vers `/fidelite`.
- **F3 — le serveur** : la surface passe à `lfc_loyalty`, et la route à
  `admin/loyalty` (le chemin `accounting` mentirait). Pré-release : dans le
  même déploiement que le front.
- **F4 — `b2b_accounting` n'est pas retiré** : il garde tout le reste de la
  comptabilité. Il perd seulement la fidélité. Pas d'aperçu de transfert :
  Hugo accorde `lfc_loyalty` à l'écran aux rôles qui doivent la garder, **avant**
  le déploiement (sans quoi ils la perdent jusqu'à l'accord). La graine
  `ROLE_GRANTS` donne `lfc_loyalty` là où elle donnait `b2b_accounting`, au
  même niveau.

## 3. Lots — révisés par la contradiction

| Lot | Contenu                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Migration de l'enum ; `lfc_loyalty` dans les contrats (schéma, libellé, portées, invariant « l'administrateur couvre tout ») ; la graine. Les gardes restent sur `b2b_accounting`. |
| —   | Geste de Hugo : accorder `lfc_loyalty` à l'écran aux rôles qui gardent la fidélité.                                                                                                |
| F2  | La bascule : garde serveur et route `admin/loyalty`, front (`/fidelite`, rail, redirection, gardes des gestes), doc, runbook.                                                      |

## Contradiction de `vitruve` (2026-10-16), qui prime sur F1–F4

- **On ne peut pas accorder avant le déploiement** (BLOQUANT) : la valeur
  d'enum n'existe qu'une fois la migration jouée, et l'écran des rôles lit
  la liste dans `@lfd/contracts`, qui part avec. D'où deux lots (§3), comme
  `lfc_catalog`.
- **Pourquoi pas d'aperçu de transfert** (BLOQUANT, le précédent mal cité) :
  `lfc_catalog` avait un aperçu parce que `b2b_catalog` était **retiré** —
  un ancien droit encore porté vidait le rôle, et un retrait non recopié
  donnait un accès. Ici, rien n'est retiré : `b2b_accounting` garde toute la
  comptabilité. Le seul risque est de **perdre** la fidélité, visible et
  réparable à l'écran ; aucun accès ne peut être gagné. Deux rôles semés la
  tiennent (admin et comptabilité, en écriture).
- **Les lecteurs de la route** (SÉRIEUX) : le front
  (`comptabilite/loyalty.service.ts:27`) et neuf e2e, dont six qui s'en
  servent pour se mettre en place (`loyalty`, `loyalty-me`,
  `loyalty-earning`, `loyalty-welcome`, `loyalty-voucher-order`,
  `guest-account-claim`, `handover-durable`, `order-staff-cancel`, et la
  scène `order-staff-cancel-voucher-scene.ts`). F2 les repointe tous.
- **Les gardes des gestes** sont codées dans `loyalty-settings.ts:134`, les
  bons et les soldes, et dans trois specs : F2 les nomme toutes.
- **La coquille** : hors de `comptabilite.routes.ts`, l'écran perd sa
  coquille. F2 vérifie comment Gestion Boutique héberge ses écrans et s'y
  range. La redirection `/comptabilite/fidelite` vit **hors** de la coquille
  comptable, sinon un rôle qui n'a que `lfc_loyalty` est refusé.
- **Irréversible, sans gravité** : la valeur d'enum reste.
- **Mineurs** : la doc `points-de-fidelite.md` et `plan-points-de-fidelite.md`,
  le JSDoc d'`admin-loyalty.controller.ts:26-28` et le commentaire de
  `comptabilite.routes.ts:99-102` suivent en F2 ; `loyalty.service.ts`
  déménage avec l'écran.

## 4. Question à Hugo — tranchée le 2026-10-16

1. **La comptabilité ne garde pas la fidélité** (Hugo). La graine donne
   `lfc_loyalty` à l'administrateur seul, en écriture ; le rôle comptabilité
   la perd à F2. À l'écran, Hugo l'accorde aux rôles qui gèrent la boutique.
