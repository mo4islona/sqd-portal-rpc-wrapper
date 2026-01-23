import { describe, expect, it, vi } from 'vitest';
import { start } from '../src/index';
import { loadConfig } from '../src/config';

describe('index', () => {
  it('starts with injected build', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = { listen: vi.fn(), close: vi.fn() };
    const build = vi.fn().mockResolvedValue(server);
    await start({ config, build });
    expect(build).toHaveBeenCalled();
    expect(server.listen).toHaveBeenCalledWith({ host: config.listenHost, port: config.listenPort });
  });
});
