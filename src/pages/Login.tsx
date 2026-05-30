import { useNavigate } from "react-router-dom";
import vaultLogo from "../assets/vault-logo.png";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async () => {
    setErrorMessage("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error(error);

      if (error.code === "auth/invalid-credential") {
        setErrorMessage("Invalid email or password.");
      } else if (error.code === "auth/user-not-found") {
        setErrorMessage("No account found with this email.");
      } else if (error.code === "auth/wrong-password") {
        setErrorMessage("Incorrect password.");
      } else {
        setErrorMessage("Unable to log in. Please try again.");
      }
    }
  };

  return (
    <main className="landing-page">
      <section className="landing-content">
        <img src={vaultLogo} alt="Vault" className="auth-logo" />

        <h1>Log In</h1>

        <p>Welcome back to Vault.</p>

        {errorMessage && <p className="error-text">{errorMessage}</p>}

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="google-btn" onClick={handleLogin}>
          Log In
        </button>

        <p className="login-text">
          Need an account?{" "}
          <span onClick={() => navigate("/register")}>Create one</span>
        </p>
      </section>
    </main>
  );
}

export default Login;