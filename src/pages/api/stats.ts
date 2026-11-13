import type {APIRoute} from 'astro';
import {passwordRequired} from '../../lib/auth';
import {stats} from '../../lib/db';
import {json} from '../../lib/http';
import {kick} from '../../lib/jobs';

export const GET: APIRoute = async () => {
  kick();
  return json({...(await stats()), auth: passwordRequired()});
};
