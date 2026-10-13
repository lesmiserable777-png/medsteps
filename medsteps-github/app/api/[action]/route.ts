import {getSource,putSource,getCatalog,putCatalog} from '@/lib/sources';
import {all,db,snapshot,sync,start,act,correct} from '@/lib/store';
import {validateCard} from '@/lib/review';
import {accessCookie,canManageSource,canUseReview,correctPhrase,checkUnlockLimit,recordUnlockAttempt} from '@/lib/access';
export const dynamic='force-dynamic';
const response=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request,{params}:any){try{const {action}=await params;if(!await canUseReview(req))return response({error:'请先解锁网站'},401);if(action==='source')return getSource(req);if(action==='catalog')return getCatalog(req);const scope=new URL(req.url).searchParams.get('lab')==='1'?'lab':'owner';if(action==='state')return response(await snapshot(scope));if(action==='backup'){const data:any={format:'medsteps-backup-v1',exportedAt:new Date().toISOString()};for(const t of ['cards','learning','progress','sessions','events','settings','sync_runs'])data[t]=await all(t);return response(data);}return response({error:'Not found'},404);}catch(e:any){console.error(e);return response({error:'读取失败：'+e.message},503);}}
export async function POST(req:Request,{params}:any){try{
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return response({error:'来源验证失败'},403);
  const {action}=await params;
  if(action!=='unlock'&&!await canUseReview(req))return response({error:'请先解锁网站'},401);
  if(['sync','source-upload','catalog-upload'].includes(action)&&!canManageSource(req))return response({error:'此操作需要管理授权'},403);
  if(!req.headers.get('content-type')?.includes('application/json'))return response({error:'需要 JSON'},415);
  const raw=await req.text();if(raw.length>4000000)return response({error:'单次数据过大'},413);const data=JSON.parse(raw);const scope=data.lab===true?'lab':'owner';
  if(action==='unlock'){
    const limit=await checkUnlockLimit(req);
    if(limit.blocked)return response({error:'尝试次数过多，请 15 分钟后重试'},429);
    const accepted=typeof data.phrase==='string'&&await correctPhrase(data.phrase);
    await recordUnlockAttempt(limit.key,limit.count,accepted);
    if(!accepted)return response({error:'解锁短语不正确'},401);
    return Response.json({ok:true},{headers:{'Set-Cookie':await accessCookie(),'Cache-Control':'no-store'}});
  }
  if(action==='source-upload')return response(await putSource(data));
  if(action==='catalog-upload')return response(await putCatalog(data));
  if(action==='sync')return response(await sync(data));
  if(action==='start')return response(await start(scope,[5,10,20].includes(data.minutes)?data.minutes:5,data.practiceId));
  if(action==='act')return response(await act(scope,data));
  if(action==='correct')return response(await correct(scope,data.id,data.rating));
  if(action==='card'){const c=validateCard(data.card);await db().prepare('UPDATE cards SET content=?,active=?,updated_at=? WHERE id=?').bind(JSON.stringify(c),data.active===false?0:1,new Date().toISOString(),c.id).run();return response(await snapshot(scope));}
  if(action==='confirm'){const c=await db().prepare('SELECT content FROM cards WHERE id=?').bind(data.id).first<any>();if(!c)throw new Error('卡片不存在');const card=JSON.parse(c.content);if(!card.source.verified)throw new Error('来源待核对，暂不能入队');await sync({cards:[],learning:[{id:`manual:${data.id}:${data.date}`,cardId:data.id,date:data.date,status:'confirmed',evidence:{text:'用户在网页明确确认已学',confirmed:true,kind:'user-confirmation'}}]});return response(await snapshot());}
  if(action==='settings'){const v=data.intervals;if(!Array.isArray(v)||v.length<1||v.length>10||v.some((n:any,i:number)=>!Number.isInteger(n)||n<1||n>365||(i>0&&n<v[i-1])))throw new Error('间隔应为递增的 1–365 整数天');await db().prepare("INSERT INTO settings(key,value) VALUES('preferences',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({intervals:v,language:Math.max(0,Math.min(100,Number(data.language)||0))})).run();return response(await snapshot(scope));}
  if(action==='restore'){
    const b=data.backup;if(b?.format!=='medsteps-backup-v1')throw new Error('备份格式不匹配');const specs:any={cards:['id','content','active','updated_at'],learning:['id','card_id','date','evidence','status','created_at'],progress:['scope','card_id','state'],sessions:['scope','revision','state'],events:['id','scope','card_id','kind','data','created_at'],settings:['key','value'],sync_runs:['id','created_at','summary']};const statements:any[]=[];
    for(const [t,cols] of Object.entries(specs) as any){if(!Array.isArray(b[t])||b[t].length>20000)throw new Error('备份表无效');for(const row of b[t]){if(t==='cards')validateCard(JSON.parse(row.content));statements.push(db().prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')}) ON CONFLICT DO NOTHING`).bind(...cols.map((k:string)=>row[k]??null)));}}
    if(statements.length>0)await db().batch(statements);return response({...(await snapshot(scope)),restoreNote:'已合并缺失记录；现有进度保留。'});
  }return response({error:'未知操作'},404);
}catch(e:any){console.error(e);return response({error:e.message||'保存失败，请重试'},400);}}

