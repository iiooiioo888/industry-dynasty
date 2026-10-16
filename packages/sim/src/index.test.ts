import { describe, expect, it } from 'vitest';
import { SIM_PACKAGE_VERSION } from './index.js';

describe('@industry-dynasty/sim', () => {
  it('exports sprint 0 package version', () => {
    expect(SIM_PACKAGE_VERSION).toBe('0.0.0-sprint0');
  });
});
