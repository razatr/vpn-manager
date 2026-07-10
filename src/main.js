#!/usr/bin/env node
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { JsonStore } from "./store.js";
import { OpenVPNProvider } from "./providers/openvpn.js";
import { VlessProvider } from "./providers/vless.js";
import { WhitelistProvider } from "./providers/whitelists.js";

const config = loadConfig(process.env.VPN_MANAGER_CONFIG);
const store = new JsonStore(config.dataDir);
await store.init();

const providers = {
  openvpn: new OpenVPNProvider(config.openvpn),
  vless: new VlessProvider(config.vless),
  whitelists: new WhitelistProvider(config.whitelists)
};

const app = createServer({ config, store, providers });

app.listen(config.port, config.host, () => {
  console.log(`vpn-manager listening on http://${config.host}:${config.port}`);
});
