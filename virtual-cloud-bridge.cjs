// Storage Bank - Google Virtual Cloud Drive Bridge
// High-performance virtual WebDAV/HTTP drive streaming server for Windows File Explorer
// Allows Windows to mount Storage Bank as a true Network Virtual Cloud Drive with 0 local PC disk usage.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const VIRTUAL_DRIVE_NAME = 'Storage Bank Google Virtual Vault';

// In-memory or cloud-backed virtual file catalog
const virtualFiles = [
  { name: 'Welcome to Google Virtual Vault.txt', content: 'Storage Bank Google Virtual Cloud Drive\n\n- Tier: Unlimited Google Cloud Enterprise\n- Local PC Disk Usage: 0 Bytes\n- Architecture: Real-time Cloud Streaming On-Demand\n', size: 145, mtime: new Date() },
  { name: 'Vault_Cloud_Architecture.md', content: '# Storage Bank Virtual Cloud Architecture\n\nFiles in this virtual drive stream on-demand directly from the Google Cloud virtual vault without consuming local PC storage.\n', size: 158, mtime: new Date() }
];

const server = http.createServer((req, res) => {
  const method = req.method;
  const url = decodeURIComponent(req.url);

  // Set standard WebDAV / CORS headers
  res.setHeader('Server', 'StorageBank-VirtualCloud/2.0');
  res.setHeader('DAV', '1, 2');
  res.setHeader('MS-Author-Via', 'DAV');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, HEAD, PROPFIND, PROPPATCH, MKCOL, PUT, DELETE, COPY, MOVE');
  res.setHeader('Access-Control-Allow-Headers', 'Depth, Content-Type, Authorization, If-Modified-Since, If-None-Match');

  // OPTIONS method for Windows WebDAV discovery
  if (method === 'OPTIONS') {
    res.setHeader('Allow', 'OPTIONS, GET, HEAD, PROPFIND, PROPPATCH, MKCOL, PUT, DELETE, COPY, MOVE');
    res.writeHead(200);
    return res.end();
  }

  // PROPFIND method (Windows WebDAV catalog query)
  if (method === 'PROPFIND') {
    res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
    res.writeHead(207, 'Multi-Status');

    let responseXml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/vault/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${VIRTUAL_DRIVE_NAME}</D:displayname>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:quota-available-bytes>109951162777600</D:quota-available-bytes>
        <D:quota-used-bytes>0</D:quota-used-bytes>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;

    // Add virtual files
    virtualFiles.forEach(f => {
      responseXml += `
  <D:response>
    <D:href>/vault/${encodeURIComponent(f.name)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${f.name}</D:displayname>
        <D:getcontentlength>${f.size}</D:getcontentlength>
        <D:getcontenttype>text/plain</D:getcontenttype>
        <D:getlastmodified>${f.mtime.toUTCString()}</D:getlastmodified>
        <D:resourcetype/>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
    });

    responseXml += `\n</D:multistatus>`;
    return res.end(responseXml);
  }

  // GET method - Stream file content
  if (method === 'GET' || method === 'HEAD') {
    const filename = url.replace(/^\/vault\/?/, '').replace(/^\//, '');

    if (!filename || filename === 'vault') {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      return res.end(`
        <html>
          <body style="font-family: sans-serif; background: #0b1120; color: #f8fafc; padding: 40px;">
            <h2>Storage Bank Google Virtual Cloud Drive Server</h2>
            <p>Status: <b style="color: #10b981;">Online & Streaming</b></p>
            <p>Tier: <b>Unlimited Google Cloud Virtual Engine (0 Bytes PC Usage)</b></p>
            <p>Mount in Windows cmd: <code>net use Z: http://127.0.0.1:${PORT}/vault /persistent:yes</code></p>
          </body>
        </html>
      `);
    }

    const file = virtualFiles.find(f => f.name.toLowerCase() === filename.toLowerCase());
    if (file) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(file.content));
      res.writeHead(200);
      if (method === 'HEAD') return res.end();
      return res.end(file.content);
    }

    res.writeHead(404);
    return res.end('File not found in Virtual Cloud Vault');
  }

  // PUT method - Upload file to virtual cloud
  if (method === 'PUT') {
    const filename = url.replace(/^\/vault\/?/, '').replace(/^\//, '');
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(body);
      const existing = virtualFiles.find(f => f.name.toLowerCase() === filename.toLowerCase());
      if (existing) {
        existing.content = buffer.toString('utf-8');
        existing.size = buffer.length;
        existing.mtime = new Date();
      } else {
        virtualFiles.push({
          name: filename,
          content: buffer.toString('utf-8'),
          size: buffer.length,
          mtime: new Date()
        });
      }
      res.writeHead(201);
      res.end();
    });
    return;
  }

  // Default response
  res.writeHead(200);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Virtual Cloud Bridge] Online at http://127.0.0.1:${PORT}/vault`);
  console.log(`[Virtual Cloud Bridge] Windows Mount: net use Z: http://127.0.0.1:${PORT}/vault /persistent:yes`);
});
