require('dotenv').config();
const sessionController = require('./controllers/sessionController');
const pool = require('./config/db');

async function test() {
  const req = { user: { id: 1, role: 'Super Admin' } };
  const res = {
    status: (code) => ({
      json: (data) => console.log(JSON.stringify(data, null, 2))
    })
  };
  await sessionController.getAdminSessions(req, res);
  pool.end();
}
test();
