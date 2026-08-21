async function test() {
  try {
    const res = await fetch('http://127.0.0.1:8000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' })
    });
    const authData = await res.json();
    const token = authData.data ? authData.data.token : authData.token;
    
    const sessRes = await fetch('http://127.0.0.1:8000/api/v1/admin/sessions', { 
      headers: { Authorization: 'Bearer ' + token } 
    });
    const sessData = await sessRes.json();
    console.log(JSON.stringify(sessData, null, 2));
  } catch (err) {
    console.error(err);
  }
}
test();
