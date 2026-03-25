const opcua = require("opcua");
const { getLogger } = require("../logger.js");

const logger = getLogger("OpcuaClient");

class OpcuaClient {
    constructor(endpoint, readRetryInterval, { clientFactory } = {}) {
        this.endpoint = endpoint;
        this.readRetryInterval = readRetryInterval || 100;
        this.client = null;
        this._clientFactory = clientFactory || ((opts) => new opcua.Client(opts));
    }

    open() {
        try {
            this.client = this._clientFactory({
                endpoint: this.endpoint,
                readRetryInterval: this.readRetryInterval,
            });
            logger.info("connected", { endpoint: this.endpoint });
        } catch (e) {
            logger.error("connect failed", { endpoint: this.endpoint, error: e.message });
            this.client = null;
        }
    }

    read(nodeIds) {
        if (this.client === null) {
            this.open();
            if (this.client === null) return null;
        }
        try {
            return this.client.read({
                nodes: nodeIds,
                timestampsToReturn: opcua.TimestampsToReturn.Both,
            });
        } catch (e) {
            logger.error("read failed", { error: e.message });
            try { this.client.close(); } catch (_) {}
            this.client = null;
            return null;
        }
    }

    close() {
        if (this.client !== null) {
            try { this.client.close(); } catch (_) {}
            this.client = null;
        }
    }
}

module.exports = OpcuaClient;
