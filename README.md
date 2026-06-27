{
  "name": "udon_m1",
  "version": "1.1.1",
  "description": "Udon_M1 - lightweight conversation and learning engine",
  "main": "src/index.js",
  "type": "commonjs",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node server.js",
    "test": "node tests/smoke.test.js && node tests/api.test.js",
    "demo": "node tools/demo.js",
    "mini:gpt": "node tools/mini-gpt-demo.js",
    "pack": "node tools/pack-ready.js"
  },
  "keywords": [
    "ai",
    "conversation",
    "learning",
    "weather"
  ],
  "license": "UNLICENSED",
  "private": true
}
