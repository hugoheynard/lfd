import { describe, expect, it } from 'vitest';

import { defaultProWorkspace } from './default-workspace';

describe('defaultProWorkspace', () => {
  it('rend la première société active', () => {
    expect(
      defaultProWorkspace([
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'active' },
      ]),
    ).toBe('b');
  });

  it('sans société active, la première', () => {
    expect(
      defaultProWorkspace([
        { id: 'a', status: 'suspended' },
        { id: 'b', status: 'pending' },
      ]),
    ).toBe('a');
  });

  it('sans société, rien', () => {
    expect(defaultProWorkspace([])).toBeNull();
  });
});
