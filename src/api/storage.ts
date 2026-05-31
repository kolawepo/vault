import { auth } from "../firebase";

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string;

export type StorageFile = {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
}

export async function listFiles(): Promise<StorageFile[]> {
  const res = await fetch(`${WORKER_URL}/files`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to list files");
  return res.json();
}

export async function uploadFile(file: File): Promise<void> {
  const headers = await authHeaders();

  const res = await fetch(`${WORKER_URL}/presign/upload`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    }),
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
    `${WORKER_URL}/presign/download/${encodeURIComponent(key)}`,
    { headers: await authHeaders() }
  );
  if (!res.ok) throw new Error("Failed to get download URL");
  const { url } = await res.json();
  return url;
}

export async function deleteFile(key: string): Promise<void> {
  const res = await fetch(`${WORKER_URL}/file/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete file");
}
