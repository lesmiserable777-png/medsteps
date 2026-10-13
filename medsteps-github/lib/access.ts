import {env} from 'cloudflare:workers';
import {db} from './store';

const cookieName='medsteps_access';
const maxAge=365*24*60*60;
const encoder=new TextEncoder();
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=(value:string)=>Uint8Array.from(value.match(/../g)||[],part=>parseInt(part,16));
function equal(a:string,b:string){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}

export function canManageSource(req:Request){
  const expected=env.ADMIN_SYNC_TOKEN;
  const supplied=req.headers.get('x-medsteps-admin')||'';
  return typeof expected==='string'&&expected.length===64&&equal(expected,supplied);
}

async function hmac(value:string){
  const secret=env.PHONE_SESSION_SECRET;
  if(typeof secret!=='string'||secret.length<64)throw new Error('手机访问尚未配置');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));
}

export async function accessCookie(){
  const expiry=Math.floor(Date.now()/1000)+maxAge;
  const message=`v1.${expiry}.${crypto.randomUUID().replaceAll('-','')}`;
  return `${cookieName}=${message}.${await hmac(message)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function hasAccess(cookieHeader:string|null){
  const value=cookieHeader?.split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!value)return false;
  const match=/^(v1\.\d{10}\.[0-9a-f]{32})\.([0-9a-f]{64})$/.exec(value);
  if(!match)return false;
  const expiry=Number(match[1].split('.')[1]);
  if(expiry<=Date.now()/1000||expiry>Date.now()/1000+maxAge+60)return false;
  return equal(await hmac(match[1]),match[2]);
}

export async function canUseReview(req:Request){return canManageSource(req)||await hasAccess(req.headers.get('cookie'));}

export async function correctPhrase(phrase:string){
  const verifier=env.PHONE_UNLOCK_VERIFIER;
  const match=typeof verifier==='string'&&/^v1\$(\d+)\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(verifier);
  if(!match)throw new Error('手机解锁尚未配置');
  if(phrase.length<1||phrase.length>256)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(phrase.normalize('NFKC')),'PBKDF2',false,['deriveBits']);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(match[2]),iterations:Number(match[1])},key,256));
  return equal(hex(derived),match[3]);
}

async function attemptKey(req:Request){
  const ip=req.headers.get('cf-connecting-ip')||'unknown';
  const input=encoder.encode(ip+'|'+env.PHONE_SESSION_SECRET);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',input));
  return 'unlock:'+hex(digest).slice(0,24);
}

export async function checkUnlockLimit(req:Request){
  const key=await attemptKey(req);
  const row=await db().prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{value:string}>();
  const state=row?JSON.parse(row.value):null;
  const now=Date.now();
  return {key,blocked:!!state&&state.until>now&&state.count>=10,count:state?.until>now?state.count:0};
}

export async function recordUnlockAttempt(key:string,count:number,success:boolean){
  if(success){await db().prepare('DELETE FROM settings WHERE key=?').bind(key).run();return;}
  const value=JSON.stringify({count:count+1,until:Date.now()+15*60*1000});
  await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();
}
