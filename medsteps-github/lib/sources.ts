import {env} from 'cloudflare:workers';
import {db} from './store';
export function validSourceKey(key:any){if(typeof key!=='string'||!/^[-a-zA-Z0-9_]{8,180}\.(png|jpg|webp)$/.test(key))throw new Error('来源文件名无效');return key;}
export async function putSource(data:any){if(!env.BUCKET)throw new Error('来源云存储不可用');const key=validSourceKey(data.key);if(typeof data.base64!=='string'||data.base64.length>2800000)throw new Error('单张来源图请小于 2 MB');const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));const type=key.endsWith('.png')?'image/png':key.endsWith('.jpg')?'image/jpeg':'image/webp';if(type==='image/png'&&!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71))throw new Error('PNG 格式不符');await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});return {key,url:'/api/source?key='+key};}
export async function getSource(req:Request){
  const key=validSourceKey(new URL(req.url).searchParams.get('key'));
  const value=await env.BUCKET?.get(key);
  if(value)return new Response(value.body,{headers:{'Content-Type':value.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
  const stored=await db().prepare('SELECT base64,content_type FROM source_assets WHERE key=?').bind(key).first<{base64:string;content_type:string}>();
  if(!stored)return new Response('Source not found',{status:404});
  const bytes=Uint8Array.from(atob(stored.base64),c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':stored.content_type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
export function validCatalogKey(key:any){if(typeof key!=='string'||!/^[-a-zA-Z0-9_.]{5,180}\.json$/.test(key)||key.includes('..'))throw new Error('目录文件名无效');return key;}
export async function putCatalog(data:any){
  if(!env.BUCKET)throw new Error('目录云存储不可用');
  const key=validCatalogKey(data.key);
  if(typeof data.base64!=='string'||data.base64.length>1400000)throw new Error('单个目录文件过大');
  const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
  JSON.parse(new TextDecoder().decode(bytes));
  await env.BUCKET.put('catalog/'+key,bytes,{httpMetadata:{contentType:'application/json'}});
  return {key,url:'/api/catalog?key='+encodeURIComponent(key)};
}
export async function getCatalog(req:Request){
  const key=validCatalogKey(new URL(req.url).searchParams.get('key'));
  const value=await env.BUCKET?.get('catalog/'+key);
  if(value)return new Response(value.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
  const stored=await db().prepare('SELECT base64 FROM source_assets WHERE key=?').bind('catalog/'+key).first<{base64:string}>();
  if(!stored)return new Response('Catalog not found',{status:404});
  return new Response(Uint8Array.from(atob(stored.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
}
