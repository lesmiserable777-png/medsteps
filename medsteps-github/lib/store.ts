import {env} from 'cloudflare:workers';
import {bjDate,freshMetrics,schedule,validateCard} from './review';
export const db=()=>{if(!env.DB)throw new Error('云端数据库暂不可用');return env.DB};
const parse=(s:any)=>typeof s==='string'?JSON.parse(s):s;
export async function all(table:string){if(!['cards','learning','progress','sessions','events','settings','sync_runs'].includes(table))throw new Error('Invalid table');return (await db().prepare(`SELECT * FROM ${table}`).all<any>()).results;}
export async function config(){const r=await db().prepare("SELECT value FROM settings WHERE key='preferences'").first<any>();return r?parse(r.value):{intervals:[1,3,7,14,30],language:70};}
export async function snapshot(scope='owner'){
  const [c,l,p,s,e,conf,runs]=await Promise.all([all('cards'),all('learning'),db().prepare('SELECT * FROM progress WHERE scope=?').bind(scope).all<any>(),db().prepare('SELECT * FROM sessions WHERE scope=?').bind(scope).first<any>(),db().prepare('SELECT * FROM events WHERE scope=? ORDER BY created_at DESC LIMIT 250').bind(scope).all<any>(),config(),db().prepare('SELECT * FROM sync_runs ORDER BY created_at DESC LIMIT 1').first<any>()]);
  return {cards:c.map(x=>({...parse(x.content),active:!!x.active})),learning:l.map(x=>({...x,evidence:parse(x.evidence)})),progress:Object.fromEntries(p.results.map(x=>[x.card_id,parse(x.state)])),session:s?{...parse(s.state),revision:s.revision}:null,events:e.results.map(x=>({...x,data:parse(x.data)})),settings:conf,lastSync:runs?.created_at||null,today:bjDate(),scope};
}
export async function sync(data:any){
  if(!Array.isArray(data.cards)||data.cards.length>300||!Array.isArray(data.learning||[]))throw new Error('同步需要 cards 与 learning 数组，每批最多 300 卡');
  const cs=data.cards.map(validateCard),ls=data.learning||[],now=new Date().toISOString();
  const oldCards=await all('cards');const verified=new Map(oldCards.map(x=>[x.id,parse(x.content).source.verified]));cs.forEach((c:any)=>verified.set(c.id,c.source.verified));const existing=new Set(oldCards.map(x=>x.id));cs.forEach((c:any)=>existing.add(c.id));
  for(const l of ls){if(!l.id||!existing.has(l.cardId)||!/^\d{4}-\d{2}-\d{2}$/.test(l.date)||l.date>bjDate()||!['confirmed','pending'].includes(l.status)||!l.evidence?.text)throw new Error('学习记录需要有效知识点、日期和明确证据');if(l.status==='confirmed'&&!l.evidence.confirmed)throw new Error('已学内容需要确认依据');}
  if(ls.some((l:any)=>l.status==='confirmed'&&!verified.get(l.cardId)))throw new Error('来源未核对的卡片不能加入复习');
  const stmts=cs.map((c:any)=>db().prepare('INSERT INTO cards(id,content,active,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at').bind(c.id,JSON.stringify(c),now));
  for(const l of ls){stmts.push(db().prepare('INSERT INTO learning(id,card_id,date,evidence,status,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET evidence=excluded.evidence,status=excluded.status').bind(l.id,l.cardId,l.date,JSON.stringify(l.evidence),l.status,now));if(l.status==='confirmed')stmts.push(db().prepare('INSERT INTO progress(scope,card_id,state) VALUES(?,?,?) ON CONFLICT(scope,card_id) DO NOTHING').bind('owner',l.cardId,JSON.stringify({learnedDate:l.date,level:-1,reviews:0,independent:0,prompted:0,due:l.date})));}
  const id=data.syncId||crypto.randomUUID();stmts.push(db().prepare('INSERT INTO sync_runs(id,created_at,summary) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,now,JSON.stringify({cards:cs.length,learning:ls.length})));
  if(stmts.length>0)await db().batch(stmts);return {ok:true,cards:cs.length,learning:ls.length,syncId:id};
}
export async function start(scope:string,minutes:number,practiceId?:string){
  const view=await snapshot(scope);if(view.session&&!view.session.done)return view;
  let cards=view.cards.filter((c:any)=>c.active&&c.source.verified&&view.progress[c.id]&&view.progress[c.id].due<=view.today);
  if(scope==='lab')cards=practiceId?view.cards.filter((c:any)=>c.id===practiceId):view.cards.slice(0,1);
  cards.sort((a:any,b:any)=>((view.progress[a.id]?.level??-1)-(view.progress[b.id]?.level??-1))||b.priority-a.priority||(view.progress[a.id]?.due||'').localeCompare(view.progress[b.id]?.due||''));
  cards=cards.slice(0,minutes===20?8:minutes===10?4:2);if(!cards.length)throw new Error('暂无到期且已确认学过的卡片');
  const state={id:crypto.randomUUID(),cards,index:0,step:0,phase:view.progress[cards[0].id]?.level>=1?'recall':'question',feedback:null,metrics:freshMetrics(),done:false,completed:[],retry:[],minutes,startedAt:new Date().toISOString(),recallText:'',recallOutcome:null};
  await db().prepare('INSERT INTO sessions(scope,revision,state) VALUES(?,0,?) ON CONFLICT(scope) DO UPDATE SET revision=sessions.revision+1,state=excluded.state').bind(scope,JSON.stringify(state)).run();return snapshot(scope);
}
export async function act(scope:string,a:any){
  if(!a.eventId||typeof a.eventId!=='string')throw new Error('Missing event ID');
  if(await db().prepare('SELECT id FROM events WHERE id=?').bind(a.eventId).first())return snapshot(scope);
  const row=await db().prepare('SELECT * FROM sessions WHERE scope=?').bind(scope).first<any>();if(!row)throw new Error('请先开始复习');if(row.revision!==a.revision)throw new Error('进度已在其他窗口更新，请重新加载');
  const s=parse(row.state);if(s.done)throw new Error('本轮已完成');const c=s.cards[s.index],step=c.steps[s.step],m=s.metrics;let p:any=null;let detail:any={action:a.action,step:s.step};
  if(a.action==='answer'){if(s.phase!=='question')throw new Error('当前步骤已完成');if(!Number.isInteger(a.choice)||a.choice<0||a.choice>=step.options.length)throw new Error('请选择有效答案');m.attempts++;detail.choice=a.choice;detail.correct=a.choice===step.answer;detail.prompted=m.hints>0||m.wrong>0||m.reveals>0;if(detail.correct){m.correct++;s.phase='feedback';s.feedback={correct:true,text:step.reason};}else{m.wrong++;s.feedback={correct:false,text:step.hint};}}
  else if(a.action==='hint'){if(s.phase!=='question')throw new Error('当前无需提示');m.hints++;s.feedback={correct:false,text:step.hint};}
  else if(a.action==='reveal'){if(s.phase!=='question')throw new Error('当前步骤已完成');m.reveals++;s.phase='feedback';s.feedback={correct:true,text:step.options[step.answer]+' — '+step.reason};}
  else if(a.action==='source'){m.hints++;if(s.phase==='recall')s.recallHelp=true;detail.sourceViewed=true;}
  else if(a.action==='next'){if(s.phase!=='feedback')throw new Error('请完成当前一步');s.step++;s.feedback=null;s.phase=s.step>=c.steps.length?'recall':'question';}
  else if(a.action==='recall'){if(s.phase!=='recall'||!['yes','partial','no'].includes(a.outcome))throw new Error('请先完成独立回忆');s.recallText=String(a.text||'').slice(0,1000);s.recallOutcome=a.outcome;s.phase='rating';detail={...detail,text:s.recallText,outcome:a.outcome,independent:a.outcome==='yes',selfAssessed:true};}
  else if(a.action==='rate'){
    if(s.phase!=='rating'||!['不会','不熟','熟悉'].includes(a.rating))throw new Error('请先做回忆检查');const prev=await db().prepare('SELECT state FROM progress WHERE scope=? AND card_id=?').bind(scope,c.id).first<any>();const before=prev?parse(prev.state):{level:-1,reviews:0,independent:0,prompted:0};const conf=await config();const independent=s.recallOutcome==='yes';const helped=m.hints+m.wrong+m.reveals>0;
    const unprompted=independent&&!s.recallHelp;p=schedule(before,a.rating,unprompted,helped,conf.intervals);detail={...detail,rating:a.rating,metrics:m,independent:unprompted,selfAssessed:true,before,after:p,recallText:s.recallText};s.completed.push({id:c.id,title:c.title,rating:a.rating,independent:unprompted,helped,due:p.due,intervalDays:p.intervalDays,improved:(before.rating==='不会'||before.helped)&&unprompted&&!helped});
    if(a.rating==='不会'&&!s.retry.includes(c.id)){s.retry.push(c.id);s.cards.push(c);}s.index++;s.step=0;s.phase='question';s.feedback=null;s.metrics=freshMetrics();s.recallOutcome=null;s.recallText='';s.recallHelp=false;s.done=s.index>=s.cards.length;
    if(!s.done){const next=await db().prepare('SELECT state FROM progress WHERE scope=? AND card_id=?').bind(scope,s.cards[s.index].id).first<any>();if(next&&parse(next.state).level>=1)s.phase='recall';}
  }else throw new Error('未知操作');
  const now=new Date().toISOString();const stmts=[db().prepare('UPDATE sessions SET state=?,revision=revision+1 WHERE scope=? AND revision=?').bind(JSON.stringify(s),scope,a.revision),db().prepare('INSERT INTO events(id,scope,card_id,kind,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(a.eventId,scope,c.id,a.action,JSON.stringify(detail),now)];
  if(p)stmts.push(db().prepare('INSERT INTO progress(scope,card_id,state) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=?) ON CONFLICT(scope,card_id) DO UPDATE SET state=excluded.state').bind(scope,c.id,JSON.stringify(p),a.eventId));
  await db().batch(stmts);if(!await db().prepare('SELECT id FROM events WHERE id=?').bind(a.eventId).first())throw new Error('进度冲突，请重新加载');return snapshot(scope);
}
export async function correct(scope:string,id:string,rating:string){
  if(!['不会','不熟','熟悉'].includes(rating))throw new Error('评价无效');const e=await db().prepare("SELECT * FROM events WHERE id=? AND scope=? AND kind='rate'").bind(id,scope).first<any>();if(!e)throw new Error('找不到复习记录');
  const latest=await db().prepare("SELECT id FROM events WHERE scope=? AND card_id=? AND kind='rate' ORDER BY created_at DESC LIMIT 1").bind(scope,e.card_id).first<any>();if(latest?.id!==id)throw new Error('只能修正此知识点最近一次评价');const d=parse(e.data),conf=await config();const after=schedule(d.before,rating,d.independent,d.metrics.hints+d.metrics.wrong+d.metrics.reveals>0,conf.intervals,new Date(e.created_at));
  await db().batch([db().prepare('UPDATE events SET data=? WHERE id=?').bind(JSON.stringify({...d,rating,after,correctedAt:new Date().toISOString()}),id),db().prepare('UPDATE progress SET state=? WHERE scope=? AND card_id=?').bind(JSON.stringify(after),scope,e.card_id)]);return snapshot(scope);
}
