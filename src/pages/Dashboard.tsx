import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import vaultLogo from "../assets/vault-logo.png";

type VaultFile = {
  name: string;
  created_at: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  id?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
};

function Dashboard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<VaultFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

const loadFiles = async () => {
  const { data, error } = await supabase.storage
    .from("vault-files")
    .list();

  console.log("FILES FROM SUPABASE:", data);
  console.log("SUPABASE ERROR:", error);

  if (error) {
    console.error(error);
    setMessage("Could not load files.");
    return;
  }

  setUploadedFiles(data || []);
};



  useEffect(() => {
    loadFiles();
  }, []);

  const formatFileSize = (size?: number) => {
    if (!size) return "Unknown";

    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileType = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toUpperCase();
    return extension || "FILE";
  };

  const cleanFileName = (fileName: string) => {
    return fileName.replace(/^\d+-/, "");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("Please choose a file first.");
      return;
    }

    setUploading(true);
    setMessage("");

    const filePath = `${Date.now()}-${selectedFile.name}`;

    const { error } = await supabase.storage
      .from("vault-files")
      .upload(filePath, selectedFile);

    if (error) {
      console.error(error);
      setMessage("Upload failed. Check Supabase policies.");
    } else {
      setSelectedFile(null);
      setMessage("File uploaded successfully.");
      await loadFiles();
    }

    setUploading(false);
  };

  return (
    <main className="vault-dashboard">
      <aside className="vault-sidebar">
        <div className="sidebar-logo">
          <img src={vaultLogo} alt="Vault" className="sidebar-logo-img" />
          <h1>VAULT</h1>
        </div>

        <nav className="sidebar-nav">
          <button className="active">▦ Dashboard</button>
          <button>□ My Files</button>
          <button>☆ Starred</button>
          <button>◷ Recent</button>
          <button>⌫ Deleted</button>
          <button>◎ Storage</button>
          <button>⚙ Settings</button>
        </nav>

        <div className="sidebar-profile">
          <div className="profile-circle">KO</div>
          <div>
            <strong>Kehinde Olawepo</strong>
            <p>Vault Free</p>
          </div>
        </div>
      </aside>

      <section className="vault-main">
        <header className="vault-topbar">
          <div>
            <h2>Welcome back, Kehinde 👋</h2>
            <p>All your important files, secured in one place.</p>
          </div>

          <input className="vault-search" placeholder="Search files, folders..." />
        </header>

        <section className="vault-cards">
          <div className="vault-card upload-panel">
            <div className="upload-icon">☁</div>
            <h3>Upload a file</h3>
            <p>Store resumes, transcripts, research papers, and more.</p>

            <input
              className="file-input"
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSelectedFile(file);
              }}
            />

            <button onClick={handleUpload} disabled={uploading}>
              {uploading ? "Uploading..." : "Upload File"}
            </button>

            {selectedFile && (
              <p className="upload-status">Selected: {selectedFile.name}</p>
            )}

            {message && <p className="upload-status">{message}</p>}
          </div>

          <div className="vault-card stat-card">
            <h3>Storage Used</h3>
            <h2>
              {formatFileSize(
                uploadedFiles.reduce(
                  (total, file) => total + (file.metadata?.size || 0),
                  0
                )
              )}
            </h2>
            <p>Files uploaded to your vault.</p>
            <div className="progress-track">
              <div className="progress-fill"></div>
            </div>
          </div>

          <div className="vault-card stat-card">
            <h3>Total Files</h3>
            <h2>{uploadedFiles.length}</h2>
            <p>Documents currently uploaded.</p>
          </div>
        </section>

        <section className="files-panel">
          <div className="files-header">
            <h2>Recent Files</h2>
            <button onClick={loadFiles}>Refresh</button>
          </div>

          {uploadedFiles.length === 0 ? (
            <p className="empty-files">No files uploaded yet.</p>
          ) : (
            <div className="files-table">
              {uploadedFiles.map((file) => (
                <div className="file-row" key={file.name}>
                  <div className="file-name">
                    <span>📄</span>
                    <strong>{cleanFileName(file.name)}</strong>
                  </div>

                  <p>{getFileType(file.name)}</p>
                  <p>{formatFileSize(file.metadata?.size)}</p>
                  <button>⋯</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default Dashboard;