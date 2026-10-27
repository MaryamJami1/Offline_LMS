const fs = require('node:fs');
const path = require('node:path');
const { AccessToken } = require('livekit-server-sdk');

// Defaults to this folder, which is right when running from source. The packaged
// student app passes the folders that could hold the .exe instead, so the config
// travels next to it on the USB drive and stays editable.
function loadConfig(dirs = [__dirname]) {
  const tried = [];
  for (const dir of dirs) {
    const configPath = path.join(dir, 'config.json');
    tried.push(configPath);
    if (!fs.existsSync(configPath)) continue;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    for (const key of ['livekitWsUrl', 'roomName', 'apiKey', 'apiSecret']) {
      if (!config[key]) throw new Error(`${configPath} is missing "${key}".`);
    }
    return config;
  }

  throw new Error(
    'No config.json found. Looked in:\n' +
      tried.map((p) => `  ${p}`).join('\n') +
      '\n\nPut config.json next to the .exe. Start from config.example.json and set ' +
      'livekitWsUrl to ws://<server LAN IP>:7880.',
  );
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
