import { AwsClient } from "aws4fetch";

export interface Env {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  BUCKET_NAME: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    const aws = makeClient(env);

    // GET /files — list bucket contents
    if (request.method === "GET" && pathname === "/files") {
      const listUrl = new URL(s3BaseUrl(env.BUCKET_NAME, env.AWS_REGION));
      listUrl.searchParams.set("list-type", "2");

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
        return {
          key,
          name: key.replace(/^\d+-/, ""),
          size,
          lastModified,
        };
      });

      return json(files);
    }

    // POST /presign/upload — { key, contentType } → presigned PUT URL (1 hour)
    if (request.method === "POST" && pathname === "/presign/upload") {
      const { key, contentType } = (await request.json()) as {
        key: string;
        contentType: string;
      };

      const signed = await aws.sign(
        new Request(s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key), {
          method: "PUT",
          headers: { "Content-Type": contentType },
        }),
        { aws: { signQuery: true, expiresIn: 3600 } }
      );

      return json({ url: signed.url });
    }

    // GET /presign/download/:key — presigned GET URL (15 minutes)
    const downloadMatch = pathname.match(/^\/presign\/download\/(.+)$/);
    if (request.method === "GET" && downloadMatch) {
      const key = decodeURIComponent(downloadMatch[1]);

      const signed = await aws.sign(
        new Request(s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key), {
          method: "GET",
        }),
        { aws: { signQuery: true, expiresIn: 900 } }
      );

      return json({ url: signed.url });
    }

    // DELETE /file/:key — delete an object
    const deleteMatch = pathname.match(/^\/file\/(.+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      const key = decodeURIComponent(deleteMatch[1]);

      const res = await aws.fetch(
        s3ObjectUrl(env.BUCKET_NAME, env.AWS_REGION, key),
        { method: "DELETE" }
      );

      if (res.status === 204 || res.status === 200) return json({ ok: true });
      return json({ error: "Delete failed" }, 502);
    }

    return json({ error: "Not found" }, 404);
  },
};
