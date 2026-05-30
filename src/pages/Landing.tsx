import { useNavigate } from "react-router-dom";
import vaultLogo from "../assets/vault-logo.png";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

function Landing() {
  const navigate = useNavigate();

const handleGoogleSignIn = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    window.location.href = "/dashboard";
  } catch (error) {
    console.error(error);
  }
};

  return (
    <main className="landing-page">
      <section className="landing-content">
        <img src={vaultLogo} alt="Vault Logo" className="vault-logo" />

        <h1>VAULT</h1>

        <p className="tagline">Store it. Find it. Own it.</p>

        <p>Secure storage for every version of your important files.</p>

        <div className="auth-actions">
          <button
  className="google-btn"
  onClick={handleGoogleSignIn}
>
  Continue with Google
</button>

          <button
            className="email-btn"
            onClick={() => navigate("/register")}
          >
            Continue with Email
          </button>
        </div>

        <p className="login-text">
          Already have an account?{" "}
          <span onClick={() => navigate("/login")}>Log In</span>
        </p>

        <p className="security-note">
          Your files. Your versions. Always secure.
        </p>
      </section>
    </main>
  );
}

export default Landing;