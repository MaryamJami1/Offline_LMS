const fs = require('node:fs');
const path = require('node:path');
const { AccessToken } = require('livekit-server-sdk');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `No config.json found at ${CONFIG_PATH}.\n` +
        'Copy config.example.json to config.json, then set livekitWsUrl to ws://<server LAN IP>:7880.',
    );
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  for (const key of ['livekitWsUrl', 'roomName', 'apiKey', 'apiSecret']) {
    if (!config[key]) throw new Error(`config.json is missing "${key}".`);
  }
  return config;
}

async function mintToken(config, role) {
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: role,
    ttl: '4h',
  });
  token.addGrant({
    roomJoin: true,
    room: config.roomName,
    canPublish: role === 'teacher',
    canSubscribe: true,
    canPublishData: false,
  });
  return token.toJwt();
}

module.exports = { loadConfig, mintToken };
