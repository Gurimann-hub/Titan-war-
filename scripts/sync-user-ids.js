const db = require('../db');

try {
  db.db.exec('PRAGMA foreign_keys = OFF;');
  db.db.prepare("UPDATE users SET id = 'usr_94812' WHERE id = 'usr_admin_001' OR email = 'alex.mercer@titan.corp'").run();
  db.db.prepare("UPDATE sessions SET user_id = 'usr_94812' WHERE user_id = 'usr_admin_001'").run();
  db.db.prepare("UPDATE recovery_codes SET user_id = 'usr_94812' WHERE user_id = 'usr_admin_001'").run();
  db.db.exec('PRAGMA foreign_keys = ON;');
  console.log('[SYNC SUCCESS] Successfully updated admin user and references to usr_94812');
} catch (err) {
  console.error('[SYNC ERROR]', err.message);
}
