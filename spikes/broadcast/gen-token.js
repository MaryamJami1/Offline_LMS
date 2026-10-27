const { loadConfig, mintToken } = require('./token');

const role = process.argv[2];

if (role !== 'teacher' && role !== 'student') {
  console.error('Usage: node gen-token.js teacher|student');
  process.exit(1);
}

async function main() {
  const config = loadConfig();
  console.log(await mintToken(config, role));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
