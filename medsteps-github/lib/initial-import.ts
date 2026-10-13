import initialSync from './initial-sync.json';
import knowledgeSync from './knowledge-sync.json';
import {db, sync} from './store';

// Bundled updates run after the owner unlocks the site. Stable IDs update
// card content, while sync() preserves answers, schedules, and paused sessions.
export async function ensureInitialImport(){
  for(const payload of [initialSync,knowledgeSync]){
    const run=await db().prepare('SELECT id FROM sync_runs WHERE id=?').bind(payload.syncId).first();
    if(!run)await sync(payload);
  }
}
