import type {APIRoute} from 'astro';
import {stats} from '../../lib/db';
import {json} from '../../lib/http';
import {pump} from '../../lib/jobs';

export const GET: APIRoute = () => {
  pump();
  return json(stats());
};
