// STATE
let allReports=[], filteredReports=[], currentTab='dashboard';
let currentUploadedImages=[], selectedDateForCalendar=null, currentCalendarDate=new Date();
let chartRatioInstance=null, chartMachineInstance=null, chartCategoryInstance=null, chartTrendInstance=null;
let firestoreReportsUnsubscribe=null, flushingPendingSync=false;
const PENDING_SYNC_KEY='router_pending_sync_ids', PENDING_DELETES_KEY='router_pending_delete_ids';

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