import * as winston from 'winston';

const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(winston.format.timestamp(), winston.format.simple(), winston.format.prettyPrint()),
});

export default logger;
