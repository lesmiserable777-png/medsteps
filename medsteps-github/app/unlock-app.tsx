'use client';
import {useState} from 'react';

export default function UnlockApp(){
  const [phrase,setPhrase]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function unlock(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch('/api/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phrase})});
      const result:any=await response.json();
      if(!response.ok)throw new Error(result.error||'解锁失败，请重试');
      setPhrase('');window.location.replace('/');
    }catch(cause){setError(cause instanceof Error?cause.message:'暂时无法解锁，请稍后重试');setBusy(false);}
  }
  return <main className="unlock-shell"><section className="unlock-card"><div className="eyebrow">医步 · 私人复习</div><h1>解锁后，开始一小步。</h1><p>这台手机首次访问时输入解锁短语。之后直接打开同一链接，无需登录 ChatGPT。</p><form onSubmit={unlock}><label htmlFor="unlock-phrase">解锁短语</label><input id="unlock-phrase" type="password" autoComplete="off" value={phrase} onChange={event=>setPhrase(event.target.value)} required maxLength={256}/><button className="primary full" disabled={busy||!phrase.trim()}>{busy?'正在解锁…':'解锁并进入复习'}</button></form>{error&&<p className="unlock-error" role="alert">{error}</p>}<p className="quiet">换手机或清除浏览器数据后，需要再输入一次。</p></section></main>;
}
