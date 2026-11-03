/** L'élément dont `data-<key>` vaut `value` — sans sélecteur construit d'un identifiant servi. */
export function byData(
  scope: HTMLElement,
  selector: string,
  key: string,
  value: string,
): HTMLElement | null {
  return (
    Array.from(scope.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.dataset[key] === value,
    ) ?? null
  );
}

/** Centre la pastille dans un rail qui défile — directement, sans défilement doux (SPEC §4). */
export function centre(rail: HTMLElement, chip: HTMLElement): void {
  if (rail.scrollWidth <= rail.clientWidth + 1) {
    return;
  }
  const max = rail.scrollWidth - rail.clientWidth;
  const target = Math.round(chip.offsetLeft + chip.offsetWidth / 2 - rail.clientWidth / 2);
  rail.scrollLeft = Math.max(0, Math.min(max, target));
}
