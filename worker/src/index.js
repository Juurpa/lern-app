import { handle } from './handlers.js';

export default { fetch: (request, env) => handle(request, env) };
