const machcli = require("machcli");
const { getInstance } = require("../lib/logger.js");

const logger = getInstance();

class MachbaseAppender {
    constructor(dbConf, table, { clientFactory } = {}) {
        this.dbConf = dbConf;
        this.table = table;
        this.dbClient = null;
        this.conn = null;
        this.appender = null;
        this._clientFactory = clientFactory || ((conf) => new machcli.Client(conf));
    }

    open() {
        this.dbClient = this._clientFactory(this.dbConf);
        try {
            this.conn = this.dbClient.connect();
            this.appender = this.conn.append(this.table);
        } catch (e) {
            try {
                this.conn && this.conn.close();
            } catch (_) {}
            try {
                this.dbClient.close();
            } catch (_) {}
            this.conn = null;
            this.dbClient = null;
            throw e;
        }
        logger.info("appender opened", { table: this.table });
    }

    isOpen() {
        return this.appender !== null;
    }

    append(name, time, value) {
        try {
            this.appender.append(name, time, value);
        } catch (e) {
            this.close();
            throw e;
        }
    }

    flush() {
        try {
            this.appender.flush();
        } catch (e) {
            this.close();
            throw e;
        }
    }

    close() {
        try {
            this.appender && this.appender.close();
        } catch (_) {}
        try {
            this.conn && this.conn.close();
        } catch (_) {}
        try {
            this.dbClient && this.dbClient.close();
        } catch (_) {}
        this.appender = null;
        this.conn = null;
        this.dbClient = null;
        logger.info("appender closed");
    }
}

module.exports = MachbaseAppender;
