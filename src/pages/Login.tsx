import { useNavigate } from "react-router-dom";
import vaultLogo from "../assets/vault-logo.png";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <main className="landing-page">
      <section className="landing-content">
        <img src={vaultLogo} alt="Vault" className="auth-logo" />

        <h1>Log In</h1>

        <p>Welcome back to Vault.</p>

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