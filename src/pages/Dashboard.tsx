import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { listFiles, uploadFile, deleteFile, getDownloadUrl, type StorageFile } from "../api/storage";
import vaultLogo from "../assets/vault-logo.png";
import DocumentChat from "../components/DocumentChat";

function Dashboard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<StorageFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [chatFile, setChatFile] = useState<StorageFile | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => { setOpenMenu(null); setConfirmDelete(null); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const loadFiles = async () => {
    try {
      const files = await listFiles();
      setUploadedFiles(files);
    } catch (err) {
      console.error(err);
      setMessage("Could not load files.");
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const formatFileSize = (size: number) => {
    if (!size) return "Unknown";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileType = (fileName: string) => {
    return fileName.split(".").pop()?.toUpperCase() || "FILE";
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("Please choose a file first.");
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      await uploadFile(selectedFile);
      setSelectedFile(null);
      setMessage("File uploaded successfully.");
      await loadFiles();
    } catch (err) {
      console.error(err);
      setMessage("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: StorageFile) => {
    setOpenMenu(null);
    try {
      const url = await getDownloadUrl(file.key);
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error(err);
      setMessage("Download failed.");
    }
  };

  const handleDelete = async (key: string) => {
    setOpenMenu(null);
    setConfirmDelete(null);
    try {
      await deleteFile(key);
      await loadFiles();
    } catch (err) {
      console.error(err);
      setMessage("Delete failed.");
    }
  };

  const totalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <>
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
          <div className="profile-circle">
            {auth.currentUser?.displayName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2) ?? "?"}
          </div>
          <div>
            <strong>{auth.currentUser?.displayName ?? "Vault User"}</strong>
            <p>Vault Free</p>
          </div>
        </div>
      </aside>

      <section className="vault-main">
        <header className="vault-topbar">
          <div>
            <h2>
              Welcome back,{" "}
              {auth.currentUser?.displayName?.split(" ")[0] ?? "there"} 👋
            </h2>
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
            <h2>{formatFileSize(totalSize)}</h2>
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
                <div className="file-row" key={file.key}>
                  <div className="file-name">
                    <span>📄</span>
                    <strong>{file.name}</strong>
                  </div>
                  <p>{getFileType(file.name)}</p>
                  <p>{formatFileSize(file.size)}</p>
                  <button
                    className="file-chat-btn"
                    onClick={(e) => { e.stopPropagation(); setChatFile(file); }}
                    title="Chat with this file"
                  >
                    ✦ Ask AI
                  </button>
                  <div className="file-menu">
                    <button
                      className="file-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(null);
                        setOpenMenu(openMenu === file.key ? null : file.key);
                      }}
                    >
                      ⋯
                    </button>
                    {openMenu === file.key && (
                      <div className="file-dropdown" onClick={(e) => e.stopPropagation()}>
                        <button className="dropdown-item" onClick={() => handleDownload(file)}>
                          ↓ Download
                        </button>
                        {confirmDelete === file.key ? (
                          <div className="delete-confirm">
                            <span>Delete file?</span>
                            <div className="delete-confirm-actions">
                              <button className="dropdown-item delete-yes" onClick={() => handleDelete(file.key)}>
                                Yes, delete
                              </button>
                              <button className="dropdown-item" onClick={() => setConfirmDelete(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button className="dropdown-item delete-item" onClick={() => setConfirmDelete(file.key)}>
                            ✕ Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>

    {chatFile && (
      <DocumentChat
        fileKey={chatFile.key}
        fileName={chatFile.name}
        onClose={() => setChatFile(null)}
      />
    )}
    </>
  );
}

export default Dashboard;
