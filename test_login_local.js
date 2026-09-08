var http = require('http');

function postLogin(host, port, payload) {
  return new Promise(function (resolve, reject) {
    var data = JSON.stringify(payload);
    var req = http.request({
      host: host,
      port: port,
      path: '/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const hosts = ['::1', 'localhost', '26.89.29.212'];
  const cred = { username: 'admin', password: 'admin123' };
  for (const h of hosts) {
    try {
      const r = await postLogin(h, 8080, cred);
      let out = 'HTTP ' + r.status;
      try { const j = JSON.parse(r.body); out += ' | ' + (j.token ? 'token OK' : JSON.stringify(j).slice(0, 120)); } catch (_) { out += ' | ' + r.body.slice(0, 60).replace(/\n/g, ' '); }
      console.log(h + ' -> ' + out);
    } catch (e) {
      console.log(h + ' -> ERRO: ' + e.message);
    }
  }
  process.exit(0);
})();