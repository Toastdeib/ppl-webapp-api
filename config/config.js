/******************************************************
 *                   CONFIG MODULE                    *
 *                                                    *
 * This module selects and loads a config file for    *
 * use by the API based on a provided environment     *
 * variable, allowing for different configs to be     *
 * easily used for different PPL events, as well as   *
 * for the test suites. If no variable is specified,  *
 * the general config file will be used, and if an    *
 * invalid one is specified, the API will fail to     *
 * initialize entirely.                               *
 ******************************************************/
import ausConfig from './config-aus.js';
import eastConfig from './config-east.js';
import generalConfig from './config-general.js';
import logger from '../util/logger.js';
import onlineConfig from './config-online.js';
import testConfig from './config-test.js';
import westConfig from './config-west.js';

const pplEvent = process.env.PPL_EVENT || 'general';
let config;
switch (pplEvent) {
    case 'east':
        config = { ...eastConfig };
        break;
    case 'west':
        config = { ...westConfig };
        break;
    case 'aus':
        config = { ...ausConfig };
        break;
    case 'online':
        config = { ...onlineConfig };
        break;
    case 'general':
        config = { ...generalConfig };
        break;
    case 'test':
        config = { ...testConfig };
        break;
    default:
        logger.api.error('PPL_EVENT environment variable is invalid, aborting startup');
        process.exit(0);
}

logger.api.info(`Running with PPL_EVENT=${pplEvent}`);
export default config;
