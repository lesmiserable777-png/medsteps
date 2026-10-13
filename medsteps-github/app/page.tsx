import ReviewApp from './review-app';
import UnlockApp from './unlock-app';
import {headers} from 'next/headers';
import {ensureInitialImport} from '@/lib/initial-import';
import {hasAccess} from '@/lib/access';
export const dynamic='force-dynamic';
export default async function Home(){
  const h=await headers();
  if(!await hasAccess(h.get('cookie')))return <UnlockApp/>;
  await ensureInitialImport();
  return <ReviewApp/>;
}
