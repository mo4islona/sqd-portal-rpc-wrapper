import { describe, expect, it } from 'vitest';
import { metricsPayload } from '../src/metrics';

describe('metrics', () => {
  it('exports metrics payload', async () => {
    const payload = await metricsPayload();
    expect(payload).toContain('requests_total');
  });
});
