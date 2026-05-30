import { useNavigate } from "react-router-dom";
import vaultLogo from "../assets/vault-logo.png";

function Login() {
  const navigate = useNavigate();

  return (
    <main className="landing-page">
      <section className="landing-content">
        <img
          src={vaultLogo}
          alt="Vault"
          className="auth-logo"
        />

        <h1>Log In</h1>

        <p>Welcome back to Vault.</p>

        <input placeholder="Email" />
        <input placeholder="Password" type="password" />

        <button className="google-btn">
          Log In
        </button>

        <p className="login-text">
          Need an account?{" "}
          <span onClick={() => navigate("/register")}>
            Create one
          </span>
        </p>
      </section>
    </main>
  );
}

export default Login;