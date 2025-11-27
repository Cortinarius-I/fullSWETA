// =====================================================
// SWETA Push Notification Worker
// Deploy to Cloudflare Workers (FREE tier)
// =====================================================

// VAPID Keys - KEEP PRIVATE KEY SECRET!
const VAPID_PUBLIC_KEY = 'BI6m8q9TjhDGC1FH1kTKkHxwiR1lLKMv-sqkXLForZ4y4QdQ5vJk1-F3hBRKCjfxPr00Io4QLB9Y2MEpG2zddlQ';
const VAPID_PRIVATE_KEY = 's6YfCfI7NbRAwRvCdLhjRBLrvE-pbMll7UDybwjV-B8';
const VAPID_SUBJECT = 'mailto:your-email@example.com'; // Change this!

// =====================================================
// Main Request Handler
// =====================================================

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    const url = new URL(request.url);
    
    // Route handling
    if (url.pathname === '/send' && request.method === 'POST') {
      return handleSendNotification(request);
    }
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), {
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }
    
    return new Response(JSON.stringify({ 
      error: 'Not found',
      endpoints: {
        'POST /send': 'Send push notification',
        'GET /health': 'Health check'
      }
    }), {
      status: 404,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
};

// =====================================================
// Send Push Notification
// =====================================================

async function handleSendNotification(request) {
  try {
    const body = await request.json();
    const { subscription, notification } = body;
    
    if (!subscription || !notification) {
      return new Response(JSON.stringify({ error: 'Missing subscription or notification' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }
    
    const payload = JSON.stringify({
      title: notification.title || 'SWETA 💜',
      body: notification.body || 'Time to check in!',
      type: notification.type || 'hourly'
    });
    
    const result = await sendWebPush(subscription, payload);
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// =====================================================
// Web Push Implementation
// =====================================================

async function sendWebPush(subscription, payload) {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;
  
  try {
    // Generate VAPID headers
    const vapidHeaders = await generateVAPIDHeaders(endpoint);
    
    // Encrypt the payload
    const encrypted = await encryptPayload(p256dh, auth, payload);
    
    // Send the request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': vapidHeaders.authorization,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': encrypted.byteLength.toString(),
        'TTL': '86400',
        ...vapidHeaders.headers
      },
      body: encrypted
    });
    
    if (response.status === 201 || response.status === 200) {
      return { success: true, status: response.status };
    } else if (response.status === 410) {
      return { success: false, expired: true, status: 410 };
    } else {
      const text = await response.text();
      return { success: false, status: response.status, error: text };
    }
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// =====================================================
// VAPID Authentication
// =====================================================

async function generateVAPIDHeaders(endpoint) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  
  const header = {
    typ: 'JWT',
    alg: 'ES256'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 86400,
    sub: VAPID_SUBJECT
  };
  
  const jwt = await createJWT(header, payload);
  
  return {
    authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    headers: {
      'Crypto-Key': `p256ecdsa=${VAPID_PUBLIC_KEY}`
    }
  };
}

async function createJWT(header, payload) {
  const encoder = new TextEncoder();
  
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;
  
  // Import private key
  const privateKeyData = base64UrlDecode(VAPID_PRIVATE_KEY);
  const privateKey = await crypto.subtle.importKey(
    'raw',
    privateKeyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  
  // Sign
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(unsignedToken)
  );
  
  // Convert signature from DER to raw format
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  
  return `${unsignedToken}.${signatureB64}`;
}

// =====================================================
// Payload Encryption (aes128gcm)
// =====================================================

async function encryptPayload(p256dhKey, authSecret, payload) {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  
  // Decode subscription keys
  const clientPublicKey = base64UrlDecode(p256dhKey);
  const authSecretBytes = base64UrlDecode(authSecret);
  
  // Generate server key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  
  // Export server public key
  const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', serverKeys.publicKey);
  const serverPublicKeyBytes = new Uint8Array(serverPublicKeyRaw);
  
  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  
  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    serverKeys.privateKey,
    256
  );
  
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive encryption key using HKDF
  const ikm = await deriveIKM(authSecretBytes, new Uint8Array(sharedSecret));
  const { contentEncryptionKey, nonce } = await deriveKeys(ikm, salt, clientPublicKey, serverPublicKeyBytes);
  
  // Add padding
  const paddingLength = 2;
  const paddedPayload = new Uint8Array(paddingLength + payloadBytes.length);
  paddedPayload[0] = 0;
  paddedPayload[1] = 0;
  paddedPayload.set(payloadBytes, paddingLength);
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    contentEncryptionKey,
    paddedPayload
  );
  
  // Build the final message (aes128gcm format)
  const recordSize = 4096;
  const header = new Uint8Array(86);
  header.set(salt, 0);
  header[16] = (recordSize >> 24) & 0xFF;
  header[17] = (recordSize >> 16) & 0xFF;
  header[18] = (recordSize >> 8) & 0xFF;
  header[19] = recordSize & 0xFF;
  header[20] = serverPublicKeyBytes.length;
  header.set(serverPublicKeyBytes, 21);
  
  const result = new Uint8Array(header.length + encrypted.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(encrypted), header.length);
  
  return result;
}

async function deriveIKM(authSecret, sharedSecret) {
  const encoder = new TextEncoder();
  const info = encoder.encode('WebPush: info\0');
  
  // Import auth secret as key
  const authKey = await crypto.subtle.importKey(
    'raw',
    authSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  
  // HKDF extract and expand
  const prk = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: authSecret,
      info: concatBuffers(info, sharedSecret)
    },
    await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']),
    256
  );
  
  return new Uint8Array(prk);
}

async function deriveKeys(ikm, salt, clientPublicKey, serverPublicKey) {
  const encoder = new TextEncoder();
  
  const keyInfo = concatBuffers(
    encoder.encode('Content-Encoding: aes128gcm\0'),
    new Uint8Array(0)
  );
  
  const nonceInfo = concatBuffers(
    encoder.encode('Content-Encoding: nonce\0'),
    new Uint8Array(0)
  );
  
  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const contentEncryptionKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: keyInfo },
    ikmKey,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt']
  );
  
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: nonceInfo },
    ikmKey,
    96
  );
  
  return { contentEncryptionKey, nonce: new Uint8Array(nonceBits) };
}

// =====================================================
// Utility Functions
// =====================================================

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBuffers(...buffers) {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result;
}

function handleCORS() {
  return new Response(null, {
    headers: corsHeaders()
  });
}

function corsHeaders(additional = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...additional
  };
}
