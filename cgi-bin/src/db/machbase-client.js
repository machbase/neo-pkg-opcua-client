const machcli = require("machcli");

class MachbaseClient {
    constructor(dbConf, { clientFactory } = {}) {
        this.dbConf = dbConf || {};
        this._clientFactory = clientFactory || ((conf) => new machcli.Client(conf));
        this.dbClient = null;
        this.conn = null;
    }

    connect() {
        this.dbClient = this._clientFactory(this.dbConf);
        try {
            this.conn = this.dbClient.connect();
        } catch (e) {
            this.close();
            throw e;
        }
        return this.conn;
    }

    exec(sql) {
        if (!this.conn) {
            throw new Error("not connected");
        }
        return this.conn.exec(sql);
    }

    query(sql, ...params) {
        if (!this.conn) {
            throw new Error("not connected");
        }

        const rows = params.length > 0 ? this.conn.query(sql, ...params) : this.conn.query(sql);
        const result = [];
        try {
            for (const row of rows) {
                result.push(row);
            }
        } finally {
            try {
                rows && rows.close && rows.close();
            } catch (_) {}
        }
        return result;
    }

    hasTable(tableName) {
        const rows = this.query(
            "SELECT NAME FROM M$SYS_TABLES WHERE NAME = ?",
            String(tableName || "").toUpperCase()
        );
        return rows.length > 0;
    }

    createTagTable(tableName) {
        const sql = [
            `CREATE TAG TABLE ${tableName} (`,
            "NAME VARCHAR(100) PRIMARY KEY,",
            "TIME DATETIME BASETIME,",
            "VALUE DOUBLE SUMMARIZED",
            ");",
        ].join(" ");
        return this.exec(sql);
    }

    close() {
        try {
            this.conn && this.conn.close();
        } catch (_) {}
        try {
            this.dbClient && this.dbClient.close();
        } catch (_) {}
        this.conn = null;
        this.dbClient = null;
    }
}

module.exports = MachbaseClient;
