import { useState } from "react";
import { supabase } from "../supabase";

function Dashboard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

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
      setUploadedFiles((prev) => [selectedFile.name, ...prev]);
      setSelectedFile(null);
      setMessage("File uploaded successfully.");
    }

    setUploading(false);
  };

  return (
    <main>
      <h1>Vault</h1>
      <p>Smart cloud document management.</p>

      <section className="upload-card">
        <h2>Upload a file</h2>
        <p>Store resumes, transcripts, research papers, and more.</p>

        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setSelectedFile(file);
          }}
        />

        <button onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload File"}
        </button>

        {selectedFile && <p>Selected: {selectedFile.name}</p>}
        {message && <p>{message}</p>}
      </section>

      <section>
        <h2>Recent Files</h2>

        {uploadedFiles.length === 0 ? (
          <p>No files uploaded yet.</p>
        ) : (
          uploadedFiles.map((fileName) => (
            <div className="file-card" key={fileName}>
              <h3>{fileName}</h3>
              <p>Uploaded today</p>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

export default Dashboard;