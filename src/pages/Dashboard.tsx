import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { listFiles, uploadFile, deleteFile, getDownloadUrl, type StorageFile } from "../api/storage";
import vaultLogo from "../assets/vault-logo.png";
import DocumentChat from "../components/DocumentChat";

type View = "dashboard" | "files" | "recent" | "storage";

function Dashboard() {
  const [activeView, setActiveView] = useState<View>("dashboard");
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

  const recentFiles = uploadedFiles.filter((f) => {
    if (!f.lastModified) return false;
    return Date.now() - new Date(f.lastModified).getTime() < 7 * 24 * 60 * 60 * 1000;
  });

  const storageByType = uploadedFiles.reduce<Record<string, { count: number; size: number }>>(
    (acc, f) => {
      const ext = f.name.split(".").pop()?.toUpperCase() || "OTHER";
      if (!acc[ext]) acc[ext] = { count: 0, size: 0 };
      acc[ext].count++;
      acc[ext].size += f.size;
      return acc;
    },
    {}
  );

  const topbarText: Record<View, { heading: string; sub: string }> = {
    dashboard: {
      heading: `Welcome back, ${auth.currentUser?.displayName?.split(" ")[0] ?? "there"} 👋`,
      sub: "All your important files, secured in one place.",
    },
    files: {
      heading: "My Files",
      sub: `${uploadedFiles.length} file${uploadedFiles.length !== 1 ? "s" : ""} in your vault.`,
    },
    recent: {
      heading: "Recent",
      sub: `${recentFiles.length} file${recentFiles.length !== 1 ? "s" : ""} uploaded in the last 7 days.`,
    },
    storage: {
      heading: "Storage",
      sub: `Using ${formatFileSize(totalSize)} across ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? "s" : ""}.`,
    },
  };

  const renderFileRow = (file: StorageFile) => (
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
  );

  return (
    <>
    <main className="vault-dashboard">
      <aside className="vault-sidebar">
        <div className="sidebar-logo">
          <img src={vaultLogo} alt="Vault" className="sidebar-logo-img" />
          <h1>VAULT</h1>
        </div>

        <nav className="sidebar-nav">
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>▦ Dashboard</button>
          <button className={activeView === "files" ? "active" : ""} onClick={() => setActiveView("files")}>□ My Files</button>
          <button className={activeView === "recent" ? "active" : ""} onClick={() => setActiveView("recent")}>◷ Recent</button>
          <button className={activeView === "storage" ? "active" : ""} onClick={() => setActiveView("storage")}>◎ Storage</button>
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
            <h2>{topbarText[activeView].heading}</h2>
            <p>{topbarText[activeView].sub}</p>
          </div>
          <input className="vault-search" placeholder="Search files, folders..." />
        </header>

        {/* DASHBOARD VIEW */}
        {activeView === "dashboard" && (
          <>
            <section className="vault-cards">
              <div className="vault-card upload-panel">
                <div className="upload-icon">☁</div>
                <h3>Upload a file</h3>
                <p>Store resumes, transcripts, research papers, and more.</p>
                <input
                  className="file-input"
                  type="file"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
                />
                <button onClick={handleUpload} disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload File"}
                </button>
                {selectedFile && <p className="upload-status">Selected: {selectedFile.name}</p>}
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
                  {uploadedFiles.map(renderFileRow)}
                </div>
              )}
            </section>
          </>
        )}

        {/* MY FILES VIEW */}
        {activeView === "files" && (
          <section className="files-panel">
            <div className="files-header">
              <h2>All Files</h2>
              <button onClick={loadFiles}>Refresh</button>
            </div>
            {uploadedFiles.length === 0 ? (
              <p className="empty-files">No files uploaded yet.</p>
            ) : (
              <div className="files-table">
                {uploadedFiles.map(renderFileRow)}
              </div>
            )}
          </section>
        )}

        {/* RECENT VIEW */}
        {activeView === "recent" && (
          <section className="files-panel">
            <div className="files-header">
              <h2>Last 7 Days</h2>
              <button onClick={loadFiles}>Refresh</button>
            </div>
            {recentFiles.length === 0 ? (
              <p className="empty-files">No files uploaded in the last 7 days.</p>
            ) : (
              <div className="files-table">
                {recentFiles.map(renderFileRow)}
              </div>
            )}
          </section>
        )}

        {/* STORAGE VIEW */}
        {activeView === "storage" && (
          <>
            <section className="vault-cards">
              <div className="vault-card stat-card">
                <h3>Total Storage Used</h3>
                <h2>{formatFileSize(totalSize)}</h2>
                <p>Across all your files.</p>
                <div className="progress-track">
                  <div className="progress-fill"></div>
                </div>
              </div>
              <div className="vault-card stat-card">
                <h3>Total Files</h3>
                <h2>{uploadedFiles.length}</h2>
                <p>Documents in your vault.</p>
              </div>
              <div className="vault-card stat-card">
                <h3>File Types</h3>
                <h2>{Object.keys(storageByType).length}</h2>
                <p>Distinct formats stored.</p>
              </div>
            </section>

            <section className="files-panel">
              <div className="files-header">
                <h2>Breakdown by Type</h2>
              </div>
              {uploadedFiles.length === 0 ? (
                <p className="empty-files">No files uploaded yet.</p>
              ) : (
                <div className="files-table">
                  {Object.entries(storageByType)
                    .sort((a, b) => b[1].size - a[1].size)
                    .map(([ext, info]) => (
                      <div className="file-row storage-type-row" key={ext}>
                        <div className="file-name">
                          <span>📁</span>
                          <strong>{ext}</strong>
                        </div>
                        <p>{info.count} file{info.count !== 1 ? "s" : ""}</p>
                        <p>{formatFileSize(info.size)}</p>
                        <div />
                        <div />
                      </div>
                    ))}
                </div>
              )}
            </section>
          </>
        )}
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
