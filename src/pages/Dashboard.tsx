import FileCard from "../components/FileCard"
import UploadCard from "../components/UploadCard"

function Dashboard() {
  return (
    <main>
      <h1>Vault</h1>
      <p>Smart cloud document management.</p>

      <UploadCard />

      <section>
        <h2>Recent Files</h2>
        <FileCard />
      </section>
    </main>
  )
}

export default Dashboard