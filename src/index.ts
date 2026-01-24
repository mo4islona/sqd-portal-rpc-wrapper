import { buildServer } from './server';
import { loadConfig, Config } from './config';

type BuildServer = typeof buildServer;

export async function start(opts?: { config?: Config; build?: BuildServer }) {
  const config = opts?.config ?? loadConfig();
  const build = opts?.build ?? buildServer;
  const server = await build(config);

  await server.listen({ host: config.listenHost, port: config.listenPort });

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

export async function runMain(startFn: () => Promise<unknown> = () => start()) {
  try {
    await startFn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}

/* c8 ignore next 3 */
if (require.main === module) {
  void runMain();
}
