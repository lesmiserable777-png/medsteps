export type Step = {kind?:string; prompt:string; zh?:string; options:string[]; answer:number; hint:string; reason:string; context?:string};
export type Card = {id:string;title:string;course:string;chapter:string;priority:number;context:string;steps:Step[];recall:string;recallAnswer:string;explanation:string;source:{file:string;pages:number[];excerpt:string;images?:string[];verified:boolean};notes?:string;active?:boolean};
export const bjDate=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(now);
export const nextDate=(days:number,now=new Date())=>bjDate(new Date(now.getTime()+days*86400000));
export function schedule(previous:any, rating:string, independent:boolean, helped:boolean, intervals:number[], now=new Date()){
  const p=previous||{level:-1,reviews:0,independent:0,prompted:0};
  const strong=rating==='熟悉'&&independent&&!helped;
  const level=strong?Math.min((p.level??-1)+1,intervals.length-1):rating==='不会'?-1:Math.min(p.level??-1,0);
  const days=strong?intervals[level]:1;
  return {...p,level,reviews:(p.reviews||0)+1,independent:(p.independent||0)+(independent?1:0),prompted:(p.prompted||0)+(helped?1:0),rating,helped,lastReview:now.toISOString(),due:nextDate(days,now),intervalDays:days};
}
export const freshMetrics=()=>({wrong:0,hints:0,reveals:0,correct:0,attempts:0});
export function validateCard(c:any):Card{
  if(!c||!/^[-a-zA-Z0-9_:.]{3,180}$/.test(c.id)||!c.title||!c.source?.file||!Array.isArray(c.source.pages)||!c.source.pages.length||!c.source.pages.every((n:any)=>Number.isInteger(n)&&n>0)||!c.source.excerpt||!Array.isArray(c.steps)||!c.steps.length||!c.recall||!c.recallAnswer)throw new Error('卡片内容或课件来源不完整');
  for(const s of c.steps)if(!s.prompt||!s.hint||!s.reason||!Array.isArray(s.options)||s.options.length<2||s.options.length>3||!Number.isInteger(s.answer)||s.answer<0||s.answer>=s.options.length)throw new Error('每步需要 2–3 个选项、有效答案和反馈');
  if(c.source.images?.some((u:any)=>typeof u!=='string'||!(u.startsWith('/sources/')||u.startsWith('/api/source?key='))||u.includes('..')))throw new Error('来源图片路径无效');
  return c;
}
