import { describe, expect, it, vi } from 'vitest';
import { runMain, start } from '../src/index';
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

  it('logs and exits on start failure', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runMain(async () => {
      throw new Error('boom');
    });

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('runs main without error', async () => {
    const startFn = vi.fn().mockResolvedValue(undefined);
    await runMain(startFn);
    expect(startFn).toHaveBeenCalled();
  });

  it('uses default loadConfig and buildServer', async () => {
    vi.resetModules();
    const server = { listen: vi.fn(), close: vi.fn() };
    const loadConfig = vi.fn().mockReturnValue({ listenHost: '127.0.0.1', listenPort: 1234 });
    const buildServer = vi.fn().mockResolvedValue(server);

    vi.doMock('../src/config', () => ({ loadConfig }));
    vi.doMock('../src/server', () => ({ buildServer }));

    const { start } = await import('../src/index');
    await start();

    expect(loadConfig).toHaveBeenCalled();
    expect(buildServer).toHaveBeenCalledWith({ listenHost: '127.0.0.1', listenPort: 1234 });
    expect(server.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 1234 });

    vi.resetModules();
    vi.unmock('../src/config');
    vi.unmock('../src/server');
  });
});
