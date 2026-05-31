import { AwsClient } from "aws4fetch";

export interface Env {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  BUCKET_NAME: string;
  FIREBASE_PROJECT_ID: string;
  SHARE_TOKENS: KVNamespace;
}

type ShareRecord = { uid: string; key: string; filename: string };

// ---------------------------------------------------------------------------
// Firebase JWT verification
// ---------------------------------------------------------------------------

type JwkSet = { keys: (JsonWebKey & { kid: string })[] };

let jwksCache: { keys: JwkSet["keys"]; fetchedAt: number } | null = null;

async function getJwks(): Promise<JwkSet["keys"]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < 3_600_000) return jwksCache.keys;
  const res = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  );
  const { keys } = (await res.json()) as JwkSet;
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function b64urlDecode(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0)
  );
}

async function verifyFirebaseToken(
  token: string,
  projectId: string
): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [rawHeader, rawPayload, rawSig] = parts;

    const header = JSON.parse(atob(rawHeader.replace(/-/g, "+").replace(/_/g, "/")));
    const payload = JSON.parse(atob(rawPayload.replace(/-/g, "+").replace(/_/g, "/")));

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!payload.sub) return null;

    const keys = await getJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      b64urlDecode(rawSig),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
    );

    return valid ? (payload.sub as string) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function s3BaseUrl(bucket: string, region: string) {
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

function s3ObjectUrl(bucket: string, region: string, key: string) {
  return `${s3BaseUrl(bucket, region)}/${encodeURIComponent(key)}`;
}

function makeClient(env: Env) {
  return new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "s3",
  });
}

// Strip the uid/ and timestamp- prefix to get the display name.
function displayName(key: string): string {
  return key.replace(/^[^/]+\/\d+-/, "");
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    const aws = makeClient(env);

    // GET /share/:token — public, no auth required
    const shareMatch = pathname.match(/^\/share\/([a-f0-9]{32})$/);
    if (request.method === "GET" && shareMatch) {
      const shareToken = shareMatch[1];
      const raw = await env.SHARE_TOKENS.get(shareToken);
      if (!raw) return json({ error: "Link not found or expired" }, 404);

      const { key, filename } = JSON.parse(raw) as ShareRecord;

      const signed = await aws.sign(
        new Request(s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key), {
          method: "GET",
        }),
        { aws: { signQuery: true, expiresIn: 900 } }
      );

      return Response.redirect(signed.url, 302);
    }

    // All other routes require a valid Firebase token.
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return json({ error: "Unauthorized" }, 401);

    const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    if (!uid) return json({ error: "Unauthorized" }, 401);

    // GET /files — list this user's files
    if (request.method === "GET" && pathname === "/files") {
      const listUrl = new URL(s3BaseUrl(env.BUCKET_NAME, env.AWS_REGION));
      listUrl.searchParams.set("list-type", "2");
      listUrl.searchParams.set("prefix", `${uid}/`);

      const res = await aws.fetch(listUrl.toString());
      if (!res.ok) return json({ error: "Failed to list files" }, 502);

      const xml = await res.text();
      const blocks = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];

      const files = blocks.map((match) => {
        const block = match[1];
        const key = block.match(/<Key>(.*?)<\/Key>/)?.[1] ?? "";
        const size = parseInt(block.match(/<Size>(.*?)<\/Size>/)?.[1] ?? "0");
        const lastModified =
          block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] ?? null;
        return { key, name: displayName(key), size, lastModified };
      });

      return json(files);
    }

    // POST /presign/upload — { filename, contentType } → presigned PUT URL
    if (request.method === "POST" && pathname === "/presign/upload") {
      const { filename, contentType } = (await request.json()) as {
        filename: string;
        contentType: string;
      };

      const key = `${uid}/${Date.now()}-${filename}`;

      const signed = await aws.sign(
        new Request(s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key), {
          method: "PUT",
          headers: { "Content-Type": contentType },
        }),
        { aws: { signQuery: true, expiresIn: 3600 } }
      );

      return json({ url: signed.url, key });
    }

    // GET /presign/download/:key — presigned GET URL (15 min)
    const downloadMatch = pathname.match(/^\/presign\/download\/(.+)$/);
    if (request.method === "GET" && downloadMatch) {
      const key = decodeURIComponent(downloadMatch[1]);

      if (!key.startsWith(`${uid}/`)) return json({ error: "Forbidden" }, 403);

      const signed = await aws.sign(
        new Request(s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key), {
          method: "GET",
        }),
        { aws: { signQuery: true, expiresIn: 900 } }
      );

      return json({ url: signed.url });
    }

    // DELETE /file/:key
    const deleteMatch = pathname.match(/^\/file\/(.+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      const key = decodeURIComponent(deleteMatch[1]);

      if (!key.startsWith(`${uid}/`)) return json({ error: "Forbidden" }, 403);

      const res = await aws.fetch(
        s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key),
        { method: "DELETE" }
      );

      if (res.status === 204 || res.status === 200) return json({ ok: true });
      return json({ error: "Delete failed" }, 502);
    }

    // POST /share — { key } → create share token (auth required)
    if (request.method === "POST" && pathname === "/share") {
      const { key } = (await request.json()) as { key: string };

      if (!key.startsWith(`${uid}/`)) return json({ error: "Forbidden" }, 403);

      const token = generateToken();
      const filename = displayName(key);
      const record: ShareRecord = { uid, key, filename };
      await env.SHARE_TOKENS.put(token, JSON.stringify(record));

      const shareUrl = `${new URL(request.url).origin}/share/${token}`;
      return json({ url: shareUrl, token });
    }

    return json({ error: "Not found" }, 404);
  },
};
