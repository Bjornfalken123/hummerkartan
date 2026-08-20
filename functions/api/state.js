import { getDb, json, dbError, actorFromContext } from '../_lib/common.js';

export async function onRequestGet(context) {
  try {
    const db = getDb(context);
    const [traps,recentChecks,recentTrips,planned] = await Promise.all([
      db.prepare(`
        SELECT t.*,
          (SELECT c.lobster_count FROM checks c WHERE c.trap_id=t.id ORDER BY c.checked_at DESC LIMIT 1) AS last_lobster_count,
          (SELECT c.notes FROM checks c WHERE c.trap_id=t.id ORDER BY c.checked_at DESC LIMIT 1) AS last_check_notes
        FROM traps t
        ORDER BY CASE WHEN t.status='active' THEN 0 ELSE 1 END, lower(t.name), t.created_at
      `).all(),
      db.prepare(`SELECT c.*,t.name AS trap_name FROM checks c LEFT JOIN traps t ON t.id=c.trap_id ORDER BY c.checked_at DESC LIMIT 150`).all(),
      db.prepare(`SELECT * FROM trips ORDER BY started_at DESC LIMIT 50`).all(),
      db.prepare(`SELECT * FROM planned_traps ORDER BY created_at,lower(name)`).all()
    ]);
    return json({
      ok:true,user:actorFromContext(context),traps:traps.results||[],checks:recentChecks.results||[],trips:recentTrips.results||[],planned_traps:planned.results||[],serverTime:new Date().toISOString()
    });
  } catch (error) { return dbError(error); }
}
