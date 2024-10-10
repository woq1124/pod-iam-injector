import * as winston from 'winston';
import { LOG_LEVEL } from '../configs';

const logger = winston.createLogger({
    level: LOG_LEVEL,
    transports: [new winston.transports.Console()],
    format: winston.format.combine(winston.format.timestamp(), winston.format.simple(), winston.format.prettyPrint()),
});

export default logger;
