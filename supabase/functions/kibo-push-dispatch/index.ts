import { dispatchSubmissionPush } from '../_shared/submission-push.ts';

Deno.serve(async request => {
  const secret = Deno.env.get('KIBO_PUSH_WORKER_SECRET');
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  try {
    return Response.json(await dispatchSubmissionPush());
  } catch {
    return Response.json({ error: 'PUSH_DISPATCH_RETRY_PENDING' }, { status: 503 });
  }
});
