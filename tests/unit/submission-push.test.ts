import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:mocks.admin}));
import { dispatchSubmissionPush } from '@/lib/notifications/submission-push';
describe('teacher submission push',()=>{
  beforeEach(()=>{vi.stubEnv('KIBO_PUSH_ENABLED','true');});
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
  it('does not access the provider or database before rollout is enabled',async()=>{
    vi.stubEnv('KIBO_PUSH_ENABLED','false');
    expect(await dispatchSubmissionPush()).toEqual({enabled:false,submitted:0});
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('sends only claimed recipients, keeps personal data out of notification text, and persists the ticket',async()=>{
    const updates:unknown[]=[];
    const chain:any={select:()=>chain,eq:()=>chain,lte:()=>chain,limit:async()=>({data:[],error:null}),
      update:(value:unknown)=>{updates.push(value);return {eq:()=>({eq:async()=>({error:null})})};}};
    mocks.admin.mockReturnValue({from:()=>chain,rpc:async()=>({data:[{id:'event',token:'ExpoPushToken[test]',profesor_id:'teacher',tenant_id:'tenant',asignacion_id:'assignment',ejercicio_id:'exercise'}],error:null})});
    const fetchMock=vi.fn(async()=>({ok:true,json:async()=>({data:[{status:'ok',id:'ticket'}]})}));vi.stubGlobal('fetch',fetchMock);
    expect(await dispatchSubmissionPush()).toEqual({enabled:true,submitted:1});
    const payload=JSON.parse((fetchMock.mock.calls[0] as any)[1].body)[0];
    expect(payload.data).toMatchObject({teacherId:'teacher',tenantId:'tenant',assignmentId:'assignment',exerciseId:'exercise'});
    expect(payload.sound).toBe('default');
    expect(payload.body).not.toContain('calificación');
    expect(updates[0]).toMatchObject({estado:'ticket',ticket_id:'ticket'});
  });
});
