import logger from './libs/logger';
import launchMutateServer from './servers/mutate-server';
import launchOidcProvider from './servers/oidc-provider';
import initializeJsonWebKeyProvider from './initialize';

async function main() {
    const jsonWebKeyProvider = await initializeJsonWebKeyProvider();

    await launchOidcProvider(jsonWebKeyProvider);
    await launchMutateServer(jsonWebKeyProvider);
}

main().catch((error) => {
    logger.error(`Fail to start: ${error.message}`, { error });
    process.exit(1);
});
