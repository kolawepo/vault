import { AwsClient } from "aws4fetch";

export interface Env {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  BUCKET_NAME: string;
  FIREBASE_PROJECT_ID: string;
  SHARE_TOKENS: KVNamespace;
  OPENAI_API_KEY: string;
}

type ShareRecord = { uid: string; key: string; filename: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

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
): Promise<{ uid: string } | { error: string }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { error: "malformed_token" };
    const [rawHeader, rawPayload, rawSig] = parts;

    const header = JSON.parse(atob(rawHeader.replace(/-/g, "+").replace(/_/g, "/")));
    const payload = JSON.parse(atob(rawPayload.replace(/-/g, "+").replace(/_/g, "/")));

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return { error: "token_expired" };
    if (payload.aud !== projectId) return { error: `aud_mismatch: token=${payload.aud} expected=${projectId}` };
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return { error: "iss_mismatch" };
    if (!payload.sub) return { error: "no_sub" };

    const keys = await getJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return { error: "jwk_not_found" };

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

    return valid ? { uid: payload.sub as string } : { error: "signature_invalid" };
  } catch (e) {
    return { error: `exception: ${e instanceof Error ? e.message : String(e)}` };
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

type GeminiMimeType =
  | "application/pdf"
  | "text/plain"
  | "text/html"
  | "text/csv"
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

function mediaTypeFromKey(key: string): GeminiMimeType | null {
  const ext = key.split(".").pop()?.toLowerCase();
  const map: Record<string, GeminiMimeType> = {
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/plain",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return ext ? (map[ext] ?? null) : null;
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

    const authResult = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    if ("error" in authResult) return json({ error: "Unauthorized", reason: authResult.error }, 401);
    const uid = authResult.uid;

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

    // POST /chat — { key, message, history } → { reply }  [powered by gpt-4o-mini]
    if (request.method === "POST" && pathname === "/chat") {
      if (!env.OPENAI_API_KEY) {
        return json({ error: "AI features are not configured on this server." }, 503);
      }

      const { key, message, history } = (await request.json()) as {
        key: string;
        message: string;
        history: ChatMessage[];
      };

      if (!key.startsWith(`${uid}/`)) return json({ error: "Forbidden" }, 403);

      const mediaType = mediaTypeFromKey(key);
      if (!mediaType) {
        return json({ error: "Unsupported file type. Try a PDF, text file, CSV, or image." }, 422);
      }

      const s3Res = await aws.fetch(s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key));
      if (!s3Res.ok) return json({ error: "Could not fetch file from storage." }, 502);

      const fileBuffer = await s3Res.arrayBuffer();
      if (fileBuffer.byteLength > MAX_FILE_BYTES) {
        return json({ error: "File is too large for AI processing. Maximum size is 20 MB." }, 413);
      }

      // Map the file to the right OpenAI content format:
      //   text/* → plain text in the message string
      //   image/* → base64 vision block
      //   application/pdf → upload via Files API, reference by file_id
      type TextPart = { type: "text"; text: string };
      type ImagePart = { type: "image_url"; image_url: { url: string } };
      type FilePart = { type: "file"; file: { file_id: string } };
      type ContentPart = TextPart | ImagePart | FilePart;
      type AnyMsg = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

      let filePrefix = "";           // prepended to text-file messages
      let filePart: ContentPart | null = null;  // vision / file-id block
      let uploadedFileId: string | null = null;

      if (mediaType.startsWith("text/")) {
        filePrefix = `Document content:\n\n${new TextDecoder().decode(fileBuffer)}\n\n---\n\n`;
      } else if (mediaType.startsWith("image/")) {
        filePart = {
          type: "image_url",
          image_url: { url: `data:${mediaType};base64,${arrayBufferToBase64(fileBuffer)}` },
        };
      } else {
        // PDF: upload to OpenAI Files API, then reference by file_id
        const form = new FormData();
        form.append("file", new Blob([fileBuffer], { type: mediaType }), displayName(key));
        form.append("purpose", "user_data");

        const uploadRes = await fetch("https://api.openai.com/v1/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: form,
        });

        if (!uploadRes.ok) {
          const err = (await uploadRes.json()) as { error?: { message: string } };
          return json({ error: err.error?.message ?? "Failed to upload file for AI processing.", detail: JSON.stringify(err) }, uploadRes.status);
        }

        const { id } = (await uploadRes.json()) as { id: string };
        uploadedFileId = id;
        filePart = { type: "file", file: { file_id: id } };
      }

      // Returns the content for the first user turn (includes the document).
      const firstContent = (q: string): string | ContentPart[] =>
        filePart ? [filePart, { type: "text", text: q }] : `${filePrefix}${q}`;

      const messages: AnyMsg[] = [
        {
          role: "system",
          content: "You are a helpful document assistant. Answer questions about the provided document clearly and concisely.",
        },
      ];

      if (history.length === 0) {
        messages.push({ role: "user", content: firstContent(message) });
      } else {
        messages.push({ role: "user", content: firstContent(history[0].content) });
        for (const turn of history.slice(1)) {
          messages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.content });
        }
        messages.push({ role: "user", content: message });
      }

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: "gpt-4o-mini", messages }),
      });

      // Clean up the uploaded file regardless of outcome (fire-and-forget)
      if (uploadedFileId) {
        fetch(`https://api.openai.com/v1/files/${uploadedFileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        }).catch(() => {});
      }

      const openaiData = (await openaiRes.json()) as {
        choices?: { message: { content: string } }[];
        error?: { message: string };
      };

      if (!openaiRes.ok) {
        return json({ error: openaiData.error?.message ?? "AI service error.", detail: JSON.stringify(openaiData) }, openaiRes.status);
      }

      const reply = openaiData.choices?.[0]?.message?.content ?? "";
      return json({ reply });
    }

    return json({ error: "Not found" }, 404);
  },
};
