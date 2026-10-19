// PENDING QUEUES
function getPendingSyncIds(){
  try{ const v=JSON.parse(localStorage.getItem(PENDING_SYNC_KEY)||'[]'); return Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'))]:[]; }catch(e){return [];}
}
function setPendingSyncIds(ids){ try{ localStorage.setItem(PENDING_SYNC_KEY,JSON.stringify([...new Set(ids)])); }catch(e){} }
function queueReportForSync(id){ if(!id)return; setPendingSyncIds([...getPendingSyncIds(),id]); }
function removeReportFromSyncQueue(id){ setPendingSyncIds(getPendingSyncIds().filter(x=>x!==id)); }

function getPendingDeleteIds(){
  try{ const v=JSON.parse(localStorage.getItem(PENDING_DELETES_KEY)||'[]'); return Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'))]:[]; }catch(e){return [];}
}
function setPendingDeleteIds(ids){ try{ localStorage.setItem(PENDING_DELETES_KEY,JSON.stringify([...new Set(ids)])); }catch(e){} }
function queueReportForDelete(id){ if(!id)return; setPendingDeleteIds([...getPendingDeleteIds(),id]); }
function removeReportFromDeleteQueue(id){ setPendingDeleteIds(getPendingDeleteIds().filter(x=>x!==id)); }

async function flushPendingCloudSync(){
  if(flushingPendingSync||(!rtdb&&!db))return;
  const pending=getPendingSyncIds(); if(!pending.length)return;
  flushingPendingSync=true;
  try{
    for(const id of pending){
      const report=allReports.find(item=>item.id===id);
      if(!report){ removeReportFromSyncQueue(id); continue; }
      const res=await writeReportToCloud(report); if(res.cloudSaved) removeReportFromSyncQueue(id);
    }
  }finally{ flushingPendingSync=false; }
}

async function flushPendingDeletes(){
  if(flushingPendingSync||(!rtdb&&!db))return;
  const pending=getPendingDeleteIds(); if(!pending.length)return;
  flushingPendingSync=true;
  try{
    for(const id of pending){
      const jobs=[];
      if(rtdb) jobs.push(Promise.resolve().then(()=>rtdb.ref('router_reports/'+id).remove()).then(()=>({ok:true,backend:'Realtime Database'})).catch(e=>({ok:false,backend:'Realtime Database',error:e})));
      if(db) jobs.push(Promise.resolve().then(()=>db.collection('router_reports').doc(id).delete()).then(()=>({ok:true,backend:'Firestore'})).catch(e=>({ok:false,backend:'Firestore',error:e})));
      if(!jobs.length){ removeReportFromDeleteQueue(id); continue; }
      const results=await Promise.all(jobs); if(results.some(x=>x.ok)) removeReportFromDeleteQueue(id);
    }
  }finally{ flushingPendingSync=false; }
}