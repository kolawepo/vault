import { useNavigate } from "react-router-dom";
import vaultLogo from "../assets/vault-logo.png";

function Register() {
  const navigate = useNavigate();

  return (
    <main className="landing-page">
      <section className="landing-content">
        <img
          src={vaultLogo}
          alt="Vault"
          className="auth-logo"
        />

        <h1>Create Account</h1>

        <p>Start organizing your important files.</p>

        <input placeholder="Full Name" />
        <input placeholder="Email" />
        <input placeholder="Password" type="password" />

        <button className="google-btn">
          Create Account
        </button>

        <p className="login-text">
          Already have an account?{" "}
          <span onClick={() => navigate("/login")}>
            Log In
          </span>
        </p>
      </section>
    </main>
  );
}

export default Register;