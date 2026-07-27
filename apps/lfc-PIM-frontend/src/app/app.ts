import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldAvatarComponent,
  FoldButtonIconComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldSearchComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FoldAppShellComponent,
    FoldAvatarComponent,
    FoldButtonIconComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Primary rail: expanded by default, collapsed via the built-in chevron.
   *  Also drives the rail wordmark (hidden while collapsed). */
  protected readonly menuExpanded = signal(true);
  /** Mobile drawer state — the primary rail becomes an off-canvas drawer ≤768px. */
  protected readonly mobileNavOpen = signal(false);
}
