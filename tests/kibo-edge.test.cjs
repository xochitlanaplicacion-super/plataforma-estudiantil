const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function handler(name, createClient, env={}) {
  let serve;
  const source=fs.readFileSync(`supabase/functions/${name}/index.ts`,'utf8')
    .replace(/^import .*;$/gm,'');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText,
    {createClient,dispatchSubmissionPush:async()=>({enabled:true,submitted:0}),Response,Date,
      Deno:{serve:fn=>serve=fn,env:{get:key=>env[key]}}});
  return serve;
}
const assignmentId='11111111-1111-4111-8111-111111111111';
const exerciseId='22222222-2222-4222-8222-222222222222';
const studentId='33333333-3333-4333-8333-333333333333';
const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
test('sender includes the student and task destination and records the Expo ticket',async()=>{
  const updates=[], exportsObject={}; let payload;
  const queue={select:()=>queue,eq:()=>queue,lte:()=>queue,limit:async()=>({data:[]}),
    update:value=>{updates.push(value);return {eq:()=>({eq:async()=>({error:null})})};}};
  const entity=value=>{const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:value})};return chain;};
  const db={from:table=>table==='cola_push_entregas'?queue:
    entity(table==='profiles'?{nombre:'Alumno',apellidos:'Prueba'}:{alumno_id:studentId}),
    rpc:async()=>({data:[{id:'event',token:'ExpoPushToken[test]',profesor_id:'teacher',tenant_id:'tenant',
      asignacion_id:assignmentId,ejercicio_id:exerciseId,resultado_id:'result'}]})};
  const source=fs.readFileSync('supabase/functions/_shared/submission-push.ts','utf8').replace(/^import .*;$/gm,'');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    exports:exportsObject,createClient:()=>db,Date,AbortSignal,
    Deno:{env:{get:key=>key==='KIBO_PUSH_ENABLED'?'true':undefined}},
    fetch:async(url,options)=>{payload=JSON.parse(options.body)[0];return {ok:true,json:async()=>({data:[{status:'ok',id:'ticket'}]})};},
  });
  assert.equal((await exportsObject.dispatchSubmissionPush()).submitted,1);
  assert.equal(payload.data.studentId,studentId);
  assert.equal(payload.data.exerciseId,exerciseId);
  assert.equal(payload.data.assignmentId,assignmentId);
  assert.equal(payload.data.tenantId,'tenant');
  assert.ok(payload.body.includes('Alumno Prueba'));
  assert.equal(updates[0].estado,'ticket');
});
test('worker requires its server secret',async()=>{
  const fn=handler('kibo-push-dispatch',null,{KIBO_PUSH_WORKER_SECRET:'test-secret'});
  assert.equal((await fn(request({}))).status,401);
  assert.equal((await fn(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test-secret'}}))).status,200);
});
test('file endpoint rejects unauthenticated requests before reading storage',async()=>{
  const fn=handler('kibo-submission-file',()=>({auth:{getUser:async()=>({data:{},error:true})}}));
  assert.equal((await fn(request({}))).status,401);
});
test('file endpoint rejects another assignment/student and provisional identities',async()=>{
  for(const students of [[],[{studentId,provisionalId:studentId}]]){
    let calls=0;
    const fn=handler('kibo-submission-file',()=>{calls++;return {
      auth:{getUser:async()=>({data:{user:{id:'teacher'}}})},
      rpc:async()=>({data:{tasks:[{id:exerciseId,students}]}}),
    };});
    assert.equal((await fn(request({assignmentId,exerciseId,studentId}))).status,403);
    assert.equal(calls,1); // privileged storage client was never created
  }
});
test('authorized teacher receives a short-lived URL only for the catalogue student',async()=>{
  const filters=[];
  const chain={select:()=>chain,eq:(key,value)=>{filters.push([key,value]);return chain;},
    single:async()=>({data:{tenant_id:'tenant'}}),
    maybeSingle:async()=>({data:{archivo_path:'tenant/entregas/file.pdf',archivo_nombre:'file.pdf'}})};
  let calls=0;
  const fn=handler('kibo-submission-file',()=>++calls===1?{
    auth:{getUser:async()=>({data:{user:{id:'teacher'}}})},
    rpc:async()=>({data:{tasks:[{id:exerciseId,students:[{studentId,enrollmentId:'enrollment'}]}]}}),
  }:{from:()=>chain,storage:{from:bucket=>({createSignedUrl:async(path,ttl,options)=>{
    assert.equal(bucket,'entregas-alumnos');assert.equal(path,'tenant/entregas/file.pdf');
    assert.equal(ttl,300);assert.equal(options.download,'file.pdf');
    return {data:{signedUrl:'https://storage.test/signed'}};
  }})}});
  const result=await fn(request({assignmentId,exerciseId,studentId,download:true}));
  assert.equal(result.status,200);
  assert.equal((await result.json()).url,'https://storage.test/signed');
  assert.ok(filters.some(([key,value])=>key==='inscripcion_alumno_id'&&value==='enrollment'));
  assert.ok(filters.some(([key,value])=>key==='tenant_id'&&value==='tenant'));
});
