const path = require('path');
const { createUdonAIApiServer } = require('./src/api/httpServer');

const rootDir = __dirname;
const port = Number(process.env.PORT || process.env.UDONAI_PORT || 3000);
const host = process.env.HOST || process.env.UDONAI_HOST || '0.0.0.0';

const api = createUdonAIApiServer({
  engineOptions: {
    rootDir,
    memoryDir: path.join(rootDir, 'memory')
  },
  apiKey: process.env.UDONAI_API_KEY || '',
  corsOrigin: process.env.UDONAI_CORS_ORIGIN || '*'
});

api.listen(port, host).then(() => {
  const status = api.engine.status();
  console.log(`Udon_M1 API server: http://${host}:${port}`);
  console.log(`- Conversation cases: ${status.conversationCases}`);
  console.log(`- Knowledge documents: ${status.knowledgeDocuments}`);
  console.log(`- API key: ${process.env.UDONAI_API_KEY ? 'enabled' : 'disabled'}`);
});
