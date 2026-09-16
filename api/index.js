// Vercel serverless entry point: the whole Express app runs as one function.
// All /api/* requests are rewritten here by vercel.json.
module.exports = require('../server/app');
