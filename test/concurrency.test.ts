import { describe, expect, it } from 'vitest';
import { ConcurrencyLimiter } from '../src/util/concurrency';

describe('concurrency limiter', () => {
  it('limits concurrency', () => {
    const limiter = new ConcurrencyLimiter(1);
    const release = limiter.tryAcquire();
    expect(release).not.toBeNull();
    const blocked = limiter.tryAcquire();
    expect(blocked).toBeNull();
    release?.();
    const next = limiter.tryAcquire();
    expect(next).not.toBeNull();
  });
});
