import { validated } from '../../middleware/validate.js';
import { overviewQuery } from './analytics.schema.js';
import { getOverview } from './analytics.service.js';

export const overview = validated({ query: overviewQuery }, async ({ query }, _req, res) => {
  res.set('Cache-Control', 'private, max-age=30').json({ data: await getOverview(query) });
});
