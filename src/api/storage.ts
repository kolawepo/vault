const WORKER_URL = import.meta.env.VITE_WORKER_URL as string;

export type StorageFile = {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
};

export async function listFiles(): Promise<StorageFile[]> {
  const res = await fetch(`${WORKER_URL}/files`);
  if (!res.ok) throw new Error("Failed to list files");
  return res.json();
}

export async function uploadFile(file: File): Promise<void> {
  const key = `${Date.now()}-${file.name}`;

  const res = await fetch(`${WORKER_URL}/presign/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, contentType: file.type || "application/octet-stream" }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");

  const { url } = await res.json();

  const upload = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!upload.ok) throw new Error("Upload to S3 failed");
}

export async function getDownloadUrl(key: string): Promise<string> {
  const res = await fetch(
    `${WORKER_URL}/presign/download/${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error("Failed to get download URL");
  const { url } = await res.json();
  return url;
}

export async function deleteFile(key: string): Promise<void> {
  const res = await fetch(
    `${WORKER_URL}/file/${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to delete file");
}
