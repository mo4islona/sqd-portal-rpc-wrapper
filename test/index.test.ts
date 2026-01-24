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

  it('registers shutdown handlers', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = { listen: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    const build = vi.fn().mockResolvedValue(server);
    const onSpy = vi.spyOn(process, 'on');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);

    await start({ config, build });

    const sigintHandler = onSpy.mock.calls.find(([event]) => event === 'SIGINT')?.[1] as (() => void) | undefined;
    const sigtermHandler = onSpy.mock.calls.find(([event]) => event === 'SIGTERM')?.[1] as (() => void) | undefined;
    expect(sigintHandler).toBeTypeOf('function');
    if (sigintHandler) {
      await sigintHandler();
      expect(server.close).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
      process.removeListener('SIGINT', sigintHandler);
    }
    if (sigtermHandler) {
      process.removeListener('SIGTERM', sigtermHandler);
    }

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});
