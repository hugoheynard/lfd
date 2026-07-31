# lfc-suite-shell

Hôte de la **suite d'outils internes** LFC : un seul login, un menu d'apps, et
chaque app **hébergée en iframe** (elle tourne telle quelle, standalone ===
embarqué).

**→ Architecture complète (pourquoi l'iframe, auth, sync d'URL, schémas) :
[`ARCHITECTURE.md`](./ARCHITECTURE.md).**

## Dev

```bash
pnpm suite:dev      # démarre le shell (7300) + PIM (7315) ensemble
```

Ouvrir `http://localhost:7300`. Au 1er chargement, si l'app hostée finit encore
son build, le cadre re-sonde tout seul et monte l'iframe (pas de F5). Après un
changement de config (`angular.json`), vider `.angular` et vérifier dans un
**onglet frais**.
